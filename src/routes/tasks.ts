import { Router, Request, Response } from 'express';
import { TaskService } from '../services/taskService';
import { SyncService } from '../services/syncService';
import { Database } from '../db/database';
import { Task } from '../types'; // Import Task for type checking

// Helper function for simple validation
const validateTaskData = (data: any) => {
    if (!data || typeof data.title !== 'string' || data.title.trim().length === 0) {
        return { valid: false, message: 'Title is required and must be a non-empty string.' };
    }
    return { valid: true, message: '' };
};

export function createTaskRouter(db: Database): Router {
  const router = Router();
  const taskService = new TaskService(db);
  // SyncService is injected but not directly used in the basic CRUD routes,
  // which is correct for separation of concerns.
  // const syncService = new SyncService(db, taskService); 

  // Get all tasks
  router.get('/', async (req: Request, res: Response) => {
    try {
      const tasks = await taskService.getAllTasks();
      res.json(tasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  });

  // Get single task
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const task = await taskService.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json(task);
    } catch (error) {
      console.error('Error fetching task:', error);
      res.status(500).json({ error: 'Failed to fetch task' });
    }
  });

  // Create task (POST /tasks)
  router.post('/', async (req: Request, res: Response) => {
    // 1. Validate request body
    const validation = validateTaskData(req.body);
    if (!validation.valid) {
        return res.status(400).json({ error: validation.message });
    }

    try {
        // We only pass safe, expected fields from the body
        const taskData: Partial<Task> = {
            title: req.body.title,
            description: req.body.description,
            completed: req.body.completed, // completed might be undefined, which is handled in the service
        };

        // 2. Call taskService.createTask()
        const createdTask = await taskService.createTask(taskData);
        
        // 3. Return created task with 201 Created status
        res.status(201).json(createdTask);

    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({ error: 'Failed to create task' });
    }
  });

  // Update task (PUT /tasks/:id)
  router.put('/:id', async (req: Request, res: Response) => {
    const taskId = req.params.id;
    // 1. Basic Validation (only allow title/description/completed for simplicity)
    const allowedUpdates = ['title', 'description', 'completed'];
    const updates: Partial<Task> = {};
    
    // Filter the request body to only include valid update fields
    for (const key of allowedUpdates) {
        if (req.body[key] !== undefined) {
            updates[key as keyof Partial<Task>] = req.body[key];
        }
    }

    // Ensure there is at least one valid update field
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields provided for update.' });
    }

    try {
        // 2. Call taskService.updateTask()
        const updatedTask = await taskService.updateTask(taskId, updates);
        
        // 3. Handle not found case
        if (!updatedTask) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        // 4. Return updated task
        res.json(updatedTask);
    } catch (error) {
        console.error(`Error updating task ${taskId}:`, error);
        res.status(500).json({ error: 'Failed to update task' });
    }
  });

  // Delete task (DELETE /tasks/:id)
  router.delete('/:id', async (req: Request, res: Response) => {
    const taskId = req.params.id;

    try {
        // 1. Call taskService.deleteTask() which performs a soft delete
        const success = await taskService.deleteTask(taskId);
        
        // 2. Handle not found case (if deleteTask returns false)
        if (!success) {
            return res.status(404).json({ error: 'Task not found or already deleted' });
        }

        // 3. Return success response
        // Use 204 No Content for successful deletion without returning a body
        res.status(204).send(); 
    } catch (error) {
        console.error(`Error deleting task ${taskId}:`, error);
        res.status(500).json({ error: 'Failed to delete task' });
    }
  });

  return router;
}