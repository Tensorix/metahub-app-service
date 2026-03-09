"""消息分析 Agent - 使用 LangChain 判断消息重要性并生成 Activity"""
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from loguru import logger

from app.config import config


class ActivitySuggestion(BaseModel):
    """Activity 建议结构"""
    is_important: bool = Field(..., description="消息是否重要，需要创建 Activity")
    activity_name: str = Field("", description="Activity 名称")
    activity_type: str = Field("", description="Activity 类型，如: task/meeting/reminder/notification")
    priority: int = Field(0, description="优先级 1-5，数字越大越重要")
    tags: list[str] = Field(default_factory=list, description="标签列表")
    comments: str = Field("", description="备注说明")
    due_date_hint: Optional[str] = Field(None, description="截止时间提示（如果消息中提到）")
    reasoning: str = Field("", description="判断理由")


class MessageAnalyzer:
    """消息分析器 - 使用 LangChain Agent 分析消息"""

    def __init__(
        self,
        model_name: Optional[str] = None,
        provider: Optional[str] = None,
        api_base_url: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        """初始化 LangChain LLM"""
        self.llm = ChatOpenAI(
            model=model_name or "gpt-4o-mini",
            temperature=0.1,
            openai_api_key=api_key or config.OPENAI_API_KEY,
            openai_api_base=api_base_url or config.OPENAI_BASE_URL,
        )
        
        # 定义输出解析器
        self.parser = PydanticOutputParser(pydantic_object=ActivitySuggestion)
        
        # 定义 Prompt 模板
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", """你是一个智能消息分析助手，负责分析 IM 消息并判断是否需要创建待办事项（Activity）。

你的任务：
1. 分析消息内容和上下文，判断消息是否重要
2. 如果重要，提取关键信息并生成 Activity 建议

重要消息的判断标准：
- 包含明确的任务分配（"请你..."、"需要..."、"帮忙..."）
- 提到会议、约会等时间安排
- 包含截止日期或紧急时间要求
- 提到重要的项目、决策或问题
- 包含紧急关键词（"紧急"、"重要"、"ASAP"、"尽快"）
- 需要回复或跟进的重要信息
- 工作相关的重要通知

不重要的消息：
- 日常闲聊、问候
- 简单的确认回复（"好的"、"收到"、"谢谢"）
- 无关紧要的信息分享
- 纯表情或图片（无文字说明）

Activity 类型说明：
- task: 需要完成的任务
- meeting: 会议、约会
- reminder: 提醒事项
- notification: 重要通知
- follow_up: 需要跟进的事项

优先级说明：
- 5: 非常紧急重要
- 4: 紧急或很重要
- 3: 一般重要
- 2: 不太重要
- 1: 可选

{format_instructions}"""),
            ("user", """请分析以下消息：

发送者：{sender_name}
消息类型：{message_type}
发送时间：{timestamp}
消息内容：{message_content}

上下文（最近的消息）：
{context_messages}

请判断是否需要创建 Activity，并提供详细的建议。""")
        ])
    
    def analyze_message(
        self,
        sender_name: str,
        message_type: str,
        message_content: str,
        context_messages: list[dict],
        timestamp: str = "",
    ) -> ActivitySuggestion:
        """
        分析消息并返回 Activity 建议
        
        Args:
            sender_name: 发送者名称
            message_type: 消息类型（如 pm/group/ai 等，仅作为上下文参考）
            message_content: 消息内容
            context_messages: 上下文消息列表，格式: [{"sender": "xxx", "content": "xxx", "timestamp": xxx}]
        
        Returns:
            ActivitySuggestion: Activity 建议
        """
        try:
            # 格式化上下文消息
            def _fmt_ts(ts) -> str:
                if isinstance(ts, (int, float)) and ts > 0:
                    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                return str(ts) if ts else ""

            context_str = "\n".join([
                f"[{_fmt_ts(msg.get('timestamp'))}] [{msg.get('sender', 'Unknown')}]: {msg.get('content', '')}"
                for msg in context_messages[-10:]  # 只取最近 10 条
            ]) if context_messages else "无上下文"
            
            # 构建完整的 prompt
            chain = self.prompt | self.llm | self.parser
            
            # 调用 LLM
            result = chain.invoke({
                "sender_name": sender_name,
                "message_type": message_type,
                "timestamp": timestamp,
                "message_content": message_content,
                "context_messages": context_str,
                "format_instructions": self.parser.get_format_instructions()
            })
            
            logger.info(f"Message analysis result: is_important={result.is_important}, reasoning={result.reasoning}")
            return result
            
        except Exception as e:
            logger.error(f"Error analyzing message: {e}")
            # 返回默认值（不重要）
            return ActivitySuggestion(
                is_important=False,
                reasoning=f"分析失败: {str(e)}"
            )


# 全局单例
_analyzer: Optional[MessageAnalyzer] = None


def get_message_analyzer(db=None) -> MessageAnalyzer:
    """获取消息分析器单例。传入 db 时从 system_config 表读取动态配置。"""
    global _analyzer
    if _analyzer is None:
        kwargs: dict = {}
        if db is not None:
            try:
                from app.service.system_config import (
                    get_message_analyzer_config,
                    resolve_provider,
                )
                cfg = get_message_analyzer_config(db)
                api_base_url, api_key = resolve_provider(db, cfg.provider)
                kwargs = dict(
                    model_name=cfg.model_name,
                    provider=cfg.provider,
                    api_base_url=api_base_url,
                    api_key=api_key,
                )
            except Exception as e:
                logger.warning(f"Failed to load analyzer config from DB: {e}")
        _analyzer = MessageAnalyzer(**kwargs)
    return _analyzer


def reset_message_analyzer() -> None:
    """清除分析器单例，下次调用时将重新创建。"""
    global _analyzer
    _analyzer = None
