# 🃏 Joker - Real-Time Card Game

## 🚀 Setup Instructions

1. **Install Docker** and **Docker Compose** on your machine.

2. **Clone this repository** and navigate into the project folder.

3. Before running the project, **create** a `.env` file in the root directory with the following variables:

   ```dotenv
   FLASK_ENV=development  # for local testing use development
   SECRET_KEY=your_secret_key_here
   DOCKER_DB=true
   ```

--> You can use the provided `.env.example` as a template.

4. **Build and start containers:**
   ```bash
   docker-compose up --build
   ```
3.5 **Build docker in detached mode** 
   ```bash
   docker-compose up --build -d
   ```

4. **Install Python dependencies (Building docker should also help you install all necessary packs from requirement.txt):**
   ```bash
   python -m pip install -r requirements.txt
   ```
  

5. **Verify the backend is running:**
   - Visit [http://localhost:8080/ping](http://localhost:8080/ping) in your browser.
   - You should see:
     ```json
     { "message": "pong from 312Joker backend!" }
     ```

---

## 🎮 Game Rules

- Each game requires **3 players**.
- At the start, **each player receives 18 cards**.
- A **visible 3-second countdown** will begin before the game starts.
- You will see a **"Take" button** next to each of your two opponents:
  - Clicking it **steals one random card** from that opponent.
  - You **cannot** grab cards from yourself.
- You may **only play pairs** by selecting two same cards and press **Send Button**:
  - Two cards of the same value, such as two 5s or two Queens.
- The game is a **real-time free-for-all**:
  - **Not** turn-based — you can play and steal cards **at any moment**!
- The **first player to play all their cards wins** the game.
- When a player has last card, their card **CANNOT** be steal
---

## 🛠️ Notes

- The project uses **Flask** (backend) + **Flask-SocketIO** for real-time WebSocket communication.
- Static files (CSS, JS, images) are served from the `frontend/static/` directory.
- MongoDB is used to manage user, room, and match history data.

