import os
import logging
from langchain_core.globals import set_debug, set_verbose
from langchain_core.messages import HumanMessage
from langchain_openrouter import ChatOpenRouter

def main():
    # 开启详细的日志输出，包含 httpx 底层网络请求和 langchain 执行细节
    logging.basicConfig(
        level=logging.DEBUG,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    # OpenRouter/OpenAI 客户端底层使用 httpx，开启它的 debug 可以看到详细的请求卡在哪个环节
    logging.getLogger("httpx").setLevel(logging.DEBUG)
    logging.getLogger("httpcore").setLevel(logging.DEBUG)
    
    # 开启 LangChain 的调试模式
    set_debug(True)
    set_verbose(True)
    # 确保设置了 OPENROUTER_API_KEY 环境变量
    # api_key = os.getenv("OPENROUTER_API_KEY")
    # if not api_key:
    #     print("请先设置环境变量: export OPENROUTER_API_KEY='your-api-key'")
    #     return

    # 初始化 OpenRouter 聊天模型
    # 你可以替换为你需要的具体模型，例如 "openai/gpt-4o", "anthropic/claude-3-opus", "meta-llama/llama-3-8b-instruct" 等
    chat = ChatOpenRouter(
        model_name="z-ai/glm-4.7",
        temperature=0.7,
        max_tokens=None,
        # max_tokens=int(500), # 修复 relay error：服务器不能解析 500.0。我们将 max_tokens 移除，或改为整数测试
        api_key="sk-xakUEXvXBFhydAKVXqIl0N4kLwMNso0G4cgNFzU8dF9Y62lT",
        base_url="https://new-api.laplacelab.cn/v1",
        max_retries=0, # 不重试，快速暴露错误
    )

    # 如果你需要使用 max_tokens，你可以尝试通过 model_kwargs 传递明确的 integer
    # chat.model_kwargs = {"max_tokens": int(500)}

    # 准备要在对话中发送的消息
    messages = [
        HumanMessage(content="你好！请用一句话向我介绍一下 OpenRouter。")
    ]

    print(f"正在通过 OpenRouter 请求模型 '{chat.model_name}'...\n")
    
    # 发送请求并获取结果
    response = chat.invoke(messages)
    
    print("模型回复:")
    print(response.content)

if __name__ == "__main__":
    main()
