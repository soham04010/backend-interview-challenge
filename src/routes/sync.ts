import { Router, Request, Response } from 'express';
import { SyncService } from '../services/syncService';
import { TaskService } from '../services/taskService';
import { Database } from '../db/database';
import { BatchSyncRequest } from '../types';

export function createSyncRouter(db: Database): Router {
  const router = Router();
  // Services are initialized here for use in the routes
  const taskService = new TaskService(db);
  const syncService = new SyncService(db, taskService);

  // Health check endpoint (correctly implemented)
  router.get('/health', async (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date() });
  });

  // Check sync status (Server-side status check)
  router.get('/status', async (req: Request, res: Response) => {
    try {
      // Get the count of pending items in the server's own internal sync queue (tasks marked 'pending')
      const pendingTasks = await taskService.getTasksNeedingSync();
      const pendingCount = pendingTasks.length;

      res.json({ 
          status: 'ready', 
          message: 'Server is ready to accept client sync requests.',
          // Indicates how many tasks on the server still need to be pushed out (should ideally be low)
          pending_local_sync_items: pendingCount, 
          server_time: new Date().toISOString(),
      });
    } catch (error) {
        console.error('Error checking sync status:', error);
        res.status(500).json({ error: 'Failed to retrieve sync status' });
    }
  });

  // Batch sync endpoint (for server-side) - THIS IS THE CORE OF THE CHALLENGE
  router.post('/batch', async (req: Request, res: Response) => {
      try {
        // 1. Validate request body
        const syncRequest: BatchSyncRequest = req.body;
        if (!syncRequest || !Array.isArray(syncRequest.items) || !syncRequest.client_timestamp) {
          return res.status(400).json({ error: 'Invalid Batch Sync Request payload. Missing items or client_timestamp.' });
        }

        // 2. Call the server-side handler for processing
        const response = await syncService.handleBatchSync(syncRequest);

        // 3. Return the processed response, which includes server changes and conflict resolutions
        res.json(response);

      } catch (error) {
        console.error('Fatal error during batch sync:', error);
        res.status(500).json({ error: 'Internal server error during sync processing' });
      }
    });

  // Trigger manual sync (Left as 501 as this is typically client-side orchestration)
  router.post('/sync', async (req: Request, res: Response) => {
    // Note: Since we implemented the core server logic in /batch, we leave this as a placeholder 
    // or recommend the client use /batch instead.
    res.status(501).json({ error: 'Use POST /sync/batch for client synchronization requests.' });
  });


  return router;
}
