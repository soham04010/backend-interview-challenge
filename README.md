Task Sync API Challenge Solution

Candidate: Soham Chaudhary
Project Goal: Implement a backend API supporting offline-first task management, synchronization, and conflict resolution using the Last-Write-Wins (LWW) strategy.

1. Project Overview and Architecture

The solution is implemented using Node.js, Express, and TypeScript. The architecture separates concerns into distinct layers:

Layer

Responsibility

Key Implementation Detail

Routes

Handles HTTP requests and responses (e.g., status codes, body validation).

src/routes/tasks.ts, src/routes/sync.ts

Services

Contains all business logic (CRUD, sync orchestration, conflict resolution).

src/services/taskService.ts, src/services/syncService.ts

Database

Handles all persistence and data queries.

src/db/database.ts (Uses SQLite)

Synchronization Strategy: Last-Write-Wins (LWW)

Mechanism: Conflict resolution is strictly based on the updated_at timestamp associated with each task.

Logic: When the server receives a change via POST /sync/batch, it compares the incoming client timestamp with the server's current version. The change with the later timestamp always prevails.

Offline Support: All CRUD operations performed by a client trigger an update to the task's updated_at timestamp and queue the operation for eventual sync.

2. Technical Assumptions and Trade-offs

A. Database Choice and Deployment Constraint

Assumption/Challenge

Resolution

SQLite Persistence

The requirement specified SQLite, but deployment on Vercel/Serverless platforms often restricts local file system writing.

Sync Queue (Client-Side)

The requirements detail client-side sync queue management.

B. Conflict Resolution and Deletion

Soft Deletes: All DELETE operations are implemented as a soft delete (is_deleted: true). This is mandatory for a sync system, as the server must know that a deletion occurred and communicate that change to other devices.

Batch Size: The documentation requested batch size optimization. For simplicity, the service is designed to process the entire batch sent by the client in a single call, optimizing for minimum latency per request.

3. How to Run and Test the Solution

A. Local Development

Clone the repository and run npm install.

Start the server (backend only): npm run dev

The API will run locally at http://localhost:3000/api.

B. Deployed Endpoint

The live API endpoint is hosted on Vercel:
https://backend-interview-challenge-theta.vercel.app/api/sync/health and https://backend-interview-challenge-theta.vercel.app/api/tasks
