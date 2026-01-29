"""
IM 桥接服务参考实现

这是一个完整的 IM 桥接服务示例，展示如何：
1. 连接到 Metahub IM Gateway
2. 转发 IM 平台消息到 Metahub
3. 接收 Metahub 的发送消息指令
4. 回报消息投递结果
5. 实现自动重连和心跳保活
"""
import asyncio
import json
import websockets
from websockets.exceptions import ConnectionClosed
from datetime import datetime
from typing import Optional


# ============================================================
# 配置
# ============================================================

METAHUB_URL = "ws://localhost:8000/api/v1/im/gateway"
API_KEY = "sk-your-api-key-here"  # 或使用 JWT token
SOURCE = "my_bot"  # IM 平台标识，如 astr_qq, astr_wechat

RECONNECT_DELAY = 5       # 初始重连间隔（秒）
MAX_RECONNECT_DELAY = 60  # 最大重连间隔
HEARTBEAT_INTERVAL = 30   # 心跳间隔


# ============================================================
# IM 桥接服务
# ============================================================

class IMBridge:
    """IM 桥接服务主类"""
    
    def __init__(self):
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self._reconnect_delay = RECONNECT_DELAY
        self._running = False
    
    async def start(self):
        """启动桥接服务（带自动重连）"""
        self._running = True
        
        while self._running:
            try:
                url = f"{METAHUB_URL}?token={API_KEY}&source={SOURCE}"
                async with websockets.connect(url) as ws:
                    self.ws = ws
                    self._reconnect_delay = RECONNECT_DELAY  # 重置延迟
                    print(f"[{self._timestamp()}] ✓ 已连接到 Metahub")
                    
                    # 并发运行心跳和消息处理
                    await asyncio.gather(
                        self._heartbeat_loop(),
                        self._receive_loop(),
                    )
                    
            except (ConnectionClosed, ConnectionError, OSError) as e:
                print(f"[{self._timestamp()}] ✗ 连接断开: {e}")
                self.ws = None
                
                if self._running:
                    print(f"[{self._timestamp()}] ⟳ {self._reconnect_delay}秒后重连...")
                    await asyncio.sleep(self._reconnect_delay)
                    self._reconnect_delay = min(
                        self._reconnect_delay * 2, MAX_RECONNECT_DELAY
                    )
            except Exception as e:
                print(f"[{self._timestamp()}] ✗ 未预期的错误: {e}")
                import traceback
                traceback.print_exc()
                await asyncio.sleep(5)
    
    async def stop(self):
        """停止桥接服务"""
        self._running = False
        if self.ws:
            await self.ws.close()
    
    async def _heartbeat_loop(self):
        """心跳保活循环"""
        while self.ws and not self.ws.closed:
            try:
                await asyncio.sleep(HEARTBEAT_INTERVAL)
                await self.ws.send(json.dumps({"type": "ping"}))
                print(f"[{self._timestamp()}] ♥ 心跳")
            except Exception as e:
                print(f"[{self._timestamp()}] ✗ 心跳失败: {e}")
                break
    
    async def _receive_loop(self):
        """接收消息循环"""
        async for raw in self.ws:
            try:
                data = json.loads(raw)
                msg_type = data.get("type")
                
                if msg_type == "send_message":
                    # 异步处理发送指令，不阻塞接收
                    asyncio.create_task(self._handle_send_message(data))
                
                elif msg_type == "pong":
                    # 心跳回复
                    pass
                
                else:
                    print(f"[{self._timestamp()}] ⚠ 未知消息类型: {msg_type}")
                    
            except Exception as e:
                print(f"[{self._timestamp()}] ✗ 处理消息失败: {e}")
    
    async def _handle_send_message(self, data: dict):
        """
        处理 Metahub 的发送消息指令
        
        收到的数据格式:
        {
            "type": "send_message",
            "request_id": "uuid",
            "session_id": "group_12345",
            "message": [{"type": "text", "text": "hello"}],
            "message_str": "hello"
        }
        """
        request_id = data["request_id"]
        session_id = data["session_id"]
        message_str = data["message_str"]
        message = data["message"]
        
        print(f"[{self._timestamp()}] ← 收到发送指令")
        print(f"  session_id: {session_id}")
        print(f"  message: {message_str}")
        
        try:
            # ============================================================
            # 在这里调用你的 IM 平台 SDK 发送消息
            # ============================================================
            # 示例:
            # result = await your_im_sdk.send_message(
            #     target=session_id,
            #     content=message_str,
            #     structured_message=message
            # )
            
            # 模拟发送（实际使用时替换为真实的 SDK 调用）
            await asyncio.sleep(0.5)  # 模拟网络延迟
            platform_message_id = f"platform_msg_{int(datetime.now().timestamp())}"
            
            # 回报成功
            await self.ws.send(json.dumps({
                "type": "result",
                "request_id": request_id,
                "success": True,
                "data": {
                    "message_id": platform_message_id,
                    "timestamp": int(datetime.now().timestamp())
                }
            }))
            print(f"[{self._timestamp()}] ✓ 消息已发送，ID: {platform_message_id}")
            
        except Exception as e:
            # 回报失败
            await self.ws.send(json.dumps({
                "type": "result",
                "request_id": request_id,
                "success": False,
                "error": str(e)
            }))
            print(f"[{self._timestamp()}] ✗ 发送失败: {e}")
    
    async def forward_im_message(self, message_data: dict):
        """
        转发 IM 平台收到的消息到 Metahub
        
        供 IM 平台的消息回调使用
        
        message_data 格式:
        {
            "timestamp": 1706000000,
            "session_id": "group_12345",
            "message_id": "msg_001",
            "session_type": "group",
            "sender": {"nickname": "张三", "user_id": "10001"},
            "self_id": "bot_001",
            "message_str": "你好",
            "message": [{"type": "text", "text": "你好"}],
            "group": {"group_id": "12345", "group_name": "测试群"}
        }
        """
        if not self.ws or self.ws.closed:
            print(f"[{self._timestamp()}] ⚠ WebSocket 未连接，消息未转发")
            return
        
        try:
            await self.ws.send(json.dumps({
                "type": "message",
                "data": message_data
            }))
            print(f"[{self._timestamp()}] → 已转发消息: {message_data['message_str'][:50]}")
        except Exception as e:
            print(f"[{self._timestamp()}] ✗ 转发消息失败: {e}")
    
    @staticmethod
    def _timestamp() -> str:
        """格式化时间戳"""
        return datetime.now().strftime("%H:%M:%S")


# ============================================================
# 模拟 IM 平台消息接收
# ============================================================

async def simulate_im_messages(bridge: IMBridge):
    """
    模拟 IM 平台定期收到消息
    实际使用时，这部分应该是 IM 平台 SDK 的回调
    """
    await asyncio.sleep(5)  # 等待连接建立
    
    messages = [
        "你好，这是第一条测试消息",
        "这是第二条消息",
        "测试 @某人 功能",
    ]
    
    for i, msg in enumerate(messages):
        await asyncio.sleep(10)  # 每10秒发一条
        
        message_data = {
            "timestamp": int(datetime.now().timestamp()),
            "session_id": "test_group_001",
            "message_id": f"msg_{int(datetime.now().timestamp())}",
            "session_type": "group",
            "sender": {
                "nickname": f"测试用户{i+1}",
                "user_id": f"user_{i+1:03d}"
            },
            "self_id": "bot_001",
            "message_str": msg,
            "message": [{"type": "text", "text": msg}],
            "group": {
                "group_id": "001",
                "group_name": "测试群"
            }
        }
        
        await bridge.forward_im_message(message_data)


# ============================================================
# 主程序
# ============================================================

async def main():
    """主程序入口"""
    print("=" * 60)
    print("IM 桥接服务启动")
    print(f"目标: {METAHUB_URL}")
    print(f"来源: {SOURCE}")
    print("=" * 60)
    
    bridge = IMBridge()
    
    try:
        # 并发运行桥接服务和消息模拟
        await asyncio.gather(
            bridge.start(),
            simulate_im_messages(bridge),
        )
    except KeyboardInterrupt:
        print("\n\n收到中断信号，正在关闭...")
        await bridge.stop()
        print("✓ 已关闭")


if __name__ == "__main__":
    asyncio.run(main())
