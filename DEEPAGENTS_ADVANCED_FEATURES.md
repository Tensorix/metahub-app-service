# DeepAgents 高级功能实现指南

## 1. SummarizationMiddleware - 对话摘要

### 功能说明

`SummarizationMiddleware` 自动压缩长对话历史，避免超出上下文窗口限制。当对话消息数量超过阈值时，自动生成摘要并替换旧消息。

### 工作原理

```
原始对话 (100条消息)
    ↓
触发摘要 (超过阈值)
    ↓
保留最近 N 条 + 生成摘要
    ↓
压缩后对话 (摘要 + 最近20条)
```

### 实现代码

```python
# app/agent/deep_agent_service.py

from deepagents.middleware import SummarizationMiddleware

def _build_summarization_middleware(self) -> Optional[SummarizationMiddleware]:
    """
    构建对话摘要中间件。
    
    当对话消息数超过阈值时，自动生成摘要并压缩历史。
    """
    # 从配置读取摘要参数
    summarization_config = self.config.get("summarization", {})
    
    if not summarization_config.get("enabled", False):
        return None
    
    return SummarizationMiddleware(
        # 触发摘要的消息数阈值
        max_messages=summarization_config.get("max_messages", 50),
        
        # 摘要后保留的最近消息数
        keep_last_n=summarization_config.get("keep_last_n", 20),
        
        # 摘要提示词（可选）
        summary_prompt=summarization_config.get(
            "summary_prompt",
            "Summarize the conversation history concisely, "
            "focusing on key decisions and context."
        ),
        
        # 用于生成摘要的模型（可选，默认使用主模型）
        model=summarization_config.get("model"),
    )

def _get_agent(self):
    """创建 agent 时添加摘要中间件"""
    if self._agent is None:
        middleware = []
        
        # SubAgent 中间件
        subagent_mw = self._build_subagent_middleware()
        if subagent_mw:
            middleware.append(subagent_mw)
        
        # 摘要中间件
        summarization_mw = self._build_summarization_middleware()
        if summarization_mw:
            middleware.append(summarization_mw)
        
        agent_kwargs = {
            "model": self._get_model_string(),
            "tools": self._get_tools(),
            "system_prompt": self.config.get("system_prompt"),
            "middleware": middleware,
            "checkpointer": self.checkpointer,
            "store": self.store,
            "backend": self._build_backend(),
        }
        
        self._agent = create_deep_agent(**agent_kwargs)
    
    return self._agent
```

### 数据库配置

```python
# app/db/model/agent.py

class Agent(Base):
    # ... 现有字段 ...
    
    # 在 metadata_ 中存储摘要配置
    # 或添加专用字段：
    summarization_config: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True, comment="对话摘要配置"
    )
```

### 使用示例

```python
# 创建带摘要功能的 Agent
agent_config = {
    "name": "Long Conversation Agent",
    "model": "gpt-4o-mini",
    "summarization": {
        "enabled": True,
        "max_messages": 50,      # 超过50条消息触发摘要
        "keep_last_n": 20,       # 保留最近20条
        "summary_prompt": "简要总结对话要点，保留关键信息。",
        "model": "gpt-4o-mini"   # 使用更便宜的模型生成摘要
    }
}
```

### 效果

**摘要前** (50条消息):
```
[Message 1] User: 你好
[Message 2] AI: 你好！
...
[Message 50] User: 刚才说到哪了？
```

**摘要后** (摘要 + 20条):
```
[Summary] 对话摘要：用户询问了关于Python的问题，讨论了列表、字典等数据结构...
[Message 31] User: 那元组呢？
...
[Message 50] User: 刚才说到哪了？
```

---

## 2. Execute 工具 - 沙盒化 Shell 执行

### 功能说明

`execute` 工具允许 Agent 在沙盒环境中执行 shell 命令，用于自动化任务、系统操作等。

### 安全特性

- ✅ 沙盒隔离（容器或虚拟环境）
- ✅ 命令白名单/黑名单
- ✅ 超时限制
- ✅ 资源限制（CPU、内存）
- ✅ 输出截断

### 实现代码

```python
# app/agent/tools/builtin/execute.py

from langchain_core.tools import tool
import subprocess
import shlex
from typing import Optional

# 命令黑名单（危险命令）
BLACKLIST = {
    "rm", "rmdir", "del", "format",
    "dd", "mkfs", "fdisk",
    "shutdown", "reboot", "halt",
    "kill", "killall", "pkill",
    "chmod", "chown", "chgrp",
    "sudo", "su",
}

# 命令白名单（允许的命令）
WHITELIST = {
    "ls", "cat", "echo", "pwd", "date",
    "grep", "find", "wc", "head", "tail",
    "git", "npm", "pip", "python",
    "curl", "wget",
}

@tool
def execute(
    command: str,
    timeout: int = 30,
    working_dir: Optional[str] = None
) -> str:
    """
    在沙盒环境中执行 shell 命令。
    
    Args:
        command: 要执行的命令
        timeout: 超时时间（秒）
        working_dir: 工作目录
    
    Returns:
        命令输出结果
    
    Examples:
        execute("ls -la")
        execute("git status")
        execute("python --version")
    """
    # 解析命令
    try:
        parts = shlex.split(command)
    except ValueError as e:
        return f"命令解析失败: {e}"
    
    if not parts:
        return "空命令"
    
    cmd_name = parts[0]
    
    # 安全检查：黑名单
    if cmd_name in BLACKLIST:
        return f"禁止执行命令: {cmd_name} (安全限制)"
    
    # 安全检查：白名单（可选，更严格）
    # if cmd_name not in WHITELIST:
    #     return f"命令未在白名单中: {cmd_name}"
    
    # 检查危险参数
    dangerous_patterns = [
        "&&", "||", ";", "|",  # 命令链接
        ">", ">>", "<",         # 重定向
        "`", "$(",              # 命令替换
    ]
    for pattern in dangerous_patterns:
        if pattern in command:
            return f"命令包含危险模式: {pattern}"
    
    try:
        # 执行命令
        result = subprocess.run(
            parts,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=working_dir,
            # 安全选项
            shell=False,  # 不使用 shell
            check=False,  # 不抛出异常
        )
        
        # 组合输出
        output = result.stdout
        if result.stderr:
            output += f"\n[stderr]\n{result.stderr}"
        
        if result.returncode != 0:
            output += f"\n[exit code: {result.returncode}]"
        
        # 截断过长输出
        max_output = 10000
        if len(output) > max_output:
            output = output[:max_output] + f"\n... (截断，总长度: {len(output)})"
        
        return output or "(无输出)"
        
    except subprocess.TimeoutExpired:
        return f"命令执行超时 ({timeout}秒)"
    except FileNotFoundError:
        return f"命令不存在: {cmd_name}"
    except Exception as e:
        return f"执行失败: {str(e)}"
```

### 注册工具

```python
# app/agent/tools/registry.py

from app.agent.tools.builtin.execute import execute

class ToolRegistry:
    _tools = {
        "calculator": calculator,
        "search": search,
        "datetime": datetime_tool,
        "execute": execute,  # 注册 execute 工具
    }
```

### 在 DeepAgents 中使用

```python
# app/agent/deep_agent_service.py

def _get_agent(self):
    """创建 agent"""
    if self._agent is None:
        # 获取自定义工具（包括 execute）
        custom_tools = self._get_tools()
        
        agent_kwargs = {
            "model": self._get_model_string(),
            "tools": custom_tools,  # execute 工具会被包含
            "system_prompt": self.config.get("system_prompt"),
            "checkpointer": self.checkpointer,
            "store": self.store,
        }
        
        self._agent = create_deep_agent(**agent_kwargs)
    
    return self._agent
```

### 使用示例

```python
# 创建带 execute 工具的 Agent
agent_config = {
    "name": "DevOps Agent",
    "model": "gpt-4o-mini",
    "system_prompt": "You are a DevOps assistant with shell access.",
    "tools": ["execute", "search"],
}

# 对话示例
user: "检查当前目录的文件"
agent: [调用 execute("ls -la")]
agent: "当前目录包含以下文件：..."

user: "查看 Python 版本"
agent: [调用 execute("python --version")]
agent: "Python 版本是 3.14.0"

user: "运行测试"
agent: [调用 execute("pytest tests/ -v")]
agent: "测试结果：8 passed, 0 failed"
```

### Docker 沙盒增强（推荐）

对于更强的隔离，可以在 Docker 容器中执行命令：

```python
@tool
def execute_in_docker(
    command: str,
    image: str = "python:3.14-slim",
    timeout: int = 30
) -> str:
    """在 Docker 容器中执行命令"""
    docker_cmd = [
        "docker", "run",
        "--rm",                    # 自动删除容器
        "--network", "none",       # 禁用网络
        "--memory", "256m",        # 内存限制
        "--cpus", "0.5",          # CPU 限制
        "--read-only",            # 只读文件系统
        image,
        "sh", "-c", command
    ]
    
    try:
        result = subprocess.run(
            docker_cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False
        )
        return result.stdout or result.stderr
    except Exception as e:
        return f"执行失败: {str(e)}"
```

---

## 配置对比

### Agent 配置示例

```python
# 完整配置（包含所有高级功能）
agent_config = {
    "name": "Advanced Agent",
    "model": "gpt-4o-mini",
    "model_provider": "openai",
    "system_prompt": "You are an advanced AI assistant.",
    
    # 基础工具
    "tools": ["calculator", "search", "execute"],
    
    # 子代理
    "subagents": [
        {
            "name": "researcher",
            "description": "Research specialist",
            "tools": ["search"],
        }
    ],
    
    # Skills 工作流
    "skills": ["./skills/research/", "./skills/coding/"],
    
    # Memory 持久化
    "memory_files": ["./AGENTS.md"],
    
    # 对话摘要（新增）
    "summarization": {
        "enabled": True,
        "max_messages": 50,
        "keep_last_n": 20,
    }
}
```

---

## 总结

### SummarizationMiddleware

**优势**:
- ✅ 自动管理上下文长度
- ✅ 降低 token 成本
- ✅ 保持对话连贯性
- ✅ 支持超长对话

**适用场景**:
- 客服对话
- 长期项目协作
- 知识库问答
- 教学辅导

### Execute 工具

**优势**:
- ✅ 自动化任务执行
- ✅ 系统操作能力
- ✅ DevOps 集成
- ✅ 沙盒安全隔离

**适用场景**:
- DevOps 自动化
- 代码测试运行
- 系统监控
- 文件处理

**安全建议**:
1. 始终使用命令白名单
2. 在 Docker 容器中执行
3. 设置严格的超时和资源限制
4. 记录所有执行的命令
5. 需要用户确认危险操作

---

## 实现优先级

| 功能 | 复杂度 | 价值 | 建议 |
|------|--------|------|------|
| SummarizationMiddleware | 低 | 高 | ✅ 优先实现 |
| Execute (基础) | 中 | 中 | ⚠️ 谨慎实现 |
| Execute (Docker) | 高 | 高 | 🔒 生产环境推荐 |
