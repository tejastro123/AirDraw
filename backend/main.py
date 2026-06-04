import json
import logging
import os
from typing import Dict, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AirDrawX-Backend")

app = FastAPI(
    title="AirDraw X Collaboration Server",
    description="Production-ready real-time WebSocket backend for Neon Air Draw",
    version="1.0.0"
)

# Load allowed CORS origins from env, defaulting to "*" for easy local development
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        # Format: { room_id: [WebSocket] }
        self.rooms: Dict[str, List[WebSocket]] = {}
        # Format: { websocket: client_id }
        self.client_ids: Dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, room_id: str, client_id: str):
        await websocket.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = []
        self.rooms[room_id].append(websocket)
        self.client_ids[websocket] = client_id
        
        logger.info(f"Client {client_id} connected to room {room_id}. Total clients in room: {len(self.rooms[room_id])}")
        
        # Notify others in the room about the new participant
        await self.broadcast(
            room_id,
            {"type": "peer_join", "clientId": client_id},
            sender=websocket
        )

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.rooms and websocket in self.rooms[room_id]:
            self.rooms[room_id].remove(websocket)
            client_id = self.client_ids.pop(websocket, "unknown")
            logger.info(f"Client {client_id} disconnected from room {room_id}")
            
            if not self.rooms[room_id]:
                del self.rooms[room_id]
                
            return client_id
        return None

    async def broadcast(self, room_id: str, message: dict, sender: WebSocket = None):
        if room_id in self.rooms:
            dead_sockets = []
            for connection in self.rooms[room_id]:
                if connection == sender:
                    continue
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending message to client: {e}")
                    dead_sockets.append(connection)
            
            for ws in dead_sockets:
                self.disconnect(ws, room_id)

manager = ConnectionManager()

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "AirDraw X Collaboration Server",
        "active_rooms_count": len(manager.rooms),
        "active_rooms": list(manager.rooms.keys())
    }

@app.websocket("/ws/{room_id}/{client_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, client_id: str):
    await manager.connect(websocket, room_id, client_id)
    try:
        while True:
            # Receive text data and decode JSON
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Inject sender client_id for verification on frontend
            message["senderId"] = client_id
            
            # Broadcast the message to everyone else in the room
            await manager.broadcast(room_id, message, sender=websocket)
    except WebSocketDisconnect:
        left_id = manager.disconnect(websocket, room_id)
        if left_id:
            await manager.broadcast(
                room_id,
                {"type": "peer_leave", "clientId": left_id}
            )
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        left_id = manager.disconnect(websocket, room_id)
        if left_id:
            await manager.broadcast(
                room_id,
                {"type": "peer_leave", "clientId": left_id}
            )

if __name__ == "__main__":
    import uvicorn
    # Use environment variables for production configuration
    server_host = os.getenv("HOST", "0.0.0.0")
    server_port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host=server_host, port=server_port)
