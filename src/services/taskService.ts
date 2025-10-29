import { v4 as uuidv4 } from 'uuid';
import { Task, SyncQueueItem } from '../types';
import { Database } from '../db/database';

export class TaskService {
    constructor(private db: Database) {}

    /**
     * Helper to create and add an operation to the Sync Queue table.
     */
    private async createAndQueueSyncItem(
        taskId: string, 
        operation: SyncQueueItem['operation'], 
        data: Partial<Task>
    ): Promise<void> {
        const syncItem: SyncQueueItem = {
            id: uuidv4(),
            task_id: taskId,
            operation: operation,
            data: data,
            created_at: new Date(),
            retry_count: 0,
        };
        // This method will be implemented in the Database class next.
        await this.db.addToSyncQueue(syncItem);
        console.log(`[Queue] Added ${operation} for Task ID: ${taskId}`);
    }


    /**
     * Creates a new Task with default sync fields.
     */
    async createTask(taskData: Partial<Task>): Promise<Task> {
        const newId = uuidv4();
        const now = new Date();

        const newTask: Task = {
            id: newId,
            title: taskData.title || 'New Task',
            description: taskData.description,
            completed: taskData.completed || false,
            is_deleted: false,
            created_at: now,
            updated_at: now,
            sync_status: 'pending', 
        };

        await this.db.save(newTask); 
        
        // Add to sync queue
        await this.createAndQueueSyncItem(newId, 'create', newTask); 

        return newTask;
    }

    /**
     * Updates an existing Task, ensuring sync fields are refreshed.
     */
    async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
        let task = await this.db.findById(id);

        if (!task || task.is_deleted) {
            return null; 
        }

        const updatedTask: Task = {
            ...task,
            ...updates,
            updated_at: new Date(), 
            sync_status: 'pending',
            id: task.id, 
            created_at: task.created_at,
        };

        await this.db.save(updatedTask);
        
        // Add to sync queue
        await this.createAndQueueSyncItem(id, 'update', updates);

        return updatedTask;
    }

    /**
     * Implements soft delete by setting is_deleted to true.
     */
    async deleteTask(id: string): Promise<boolean> {
        let task = await this.db.findById(id);

        if (!task || task.is_deleted) {
            return false;
        }

        task.is_deleted = true;
        task.updated_at = new Date();
        task.sync_status = 'pending';

        await this.db.save(task);

        // Add to sync queue
        await this.createAndQueueSyncItem(id, 'delete', { is_deleted: true });
        
        return true;
    }

    /**
     * Gets a single task, excluding soft-deleted ones.
     */
    async getTask(id: string): Promise<Task | null> {
        const task = await this.db.findById(id);
        
        if (!task || task.is_deleted) {
            return null;
        }

        return task;
    }

    /**
     * Gets all non-deleted tasks.
     */
    async getAllTasks(): Promise<Task[]> {
        const allTasks = await this.db.find({ is_deleted: false }); 
        
        return allTasks;
    }

    /**
     * Gets all tasks that need to be synchronized with the server.
     */
    async getTasksNeedingSync(): Promise<Task[]> {
        // Query tasks that are locally created/modified and awaiting server sync (if this were client-side)
        // Since this is the server, this method might be unused, but we implement it based on the challenge structure.
        const tasks = await this.db.find({ 
            $or: [
                { sync_status: 'pending' }, 
                { sync_status: 'error' }
            ]
        }); 
        
        return tasks;
    }
}
