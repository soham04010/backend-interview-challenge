import sqlite3 from 'sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { Task, SyncQueueItem } from '../types';

const sqlite = sqlite3.verbose();

// --- Helper Functions for Data Mapping ---

// Converts a database row (using INTEGER 0/1 for boolean/delete) back to a Task object.
const rowToTask = (row: any): Task | null => {
    if (!row) return null;
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        completed: !!row.completed, // Convert 0/1 to false/true
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
        is_deleted: !!row.is_deleted, // Convert 0/1 to false/true
        sync_status: row.sync_status as Task['sync_status'],
        server_id: row.server_id,
        last_synced_at: row.last_synced_at ? new Date(row.last_synced_at) : undefined,
    } as Task;
};

// --- Database Class Implementation ---

export class Database {
    private db: sqlite3.Database;

    constructor(filename: string = ':memory:') {
        this.db = new sqlite.Database(filename); 
    }

    async initialize(): Promise<void> {
        await this.createTables();
    }

    private async createTables(): Promise<void> {
        const createTasksTable = `
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                completed INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_deleted INTEGER DEFAULT 0,
                sync_status TEXT DEFAULT 'pending',
                server_id TEXT,
                last_synced_at DATETIME
            )
        `;

        const createSyncQueueTable = `
            CREATE TABLE IF NOT EXISTS sync_queue (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                operation TEXT NOT NULL,
                data TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                retry_count INTEGER DEFAULT 0,
                error_message TEXT,
                FOREIGN KEY (task_id) REFERENCES tasks(id)
            )
        `;

        await this.run(createTasksTable);
        await this.run(createSyncQueueTable);
    }
    
    // ----------------------------------------------------------------------
    // CORE TASK METHODS (CRUD)
    // ----------------------------------------------------------------------

    async save(task: Task): Promise<void> {
        const sql = `
            INSERT OR REPLACE INTO tasks (
                id, title, description, completed, created_at, updated_at, 
                is_deleted, sync_status, server_id, last_synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await this.run(sql, [
            task.id, 
            task.title, 
            task.description, 
            task.completed ? 1 : 0, 
            task.created_at.toISOString(), 
            task.updated_at.toISOString(), 
            task.is_deleted ? 1 : 0, 
            task.sync_status, 
            task.server_id || null, 
            task.last_synced_at ? task.last_synced_at.toISOString() : null
        ]);
    }

    async findById(id: string): Promise<Task | null> {
        const sql = 'SELECT * FROM tasks WHERE id = ?';
        const row = await this.get(sql, [id]);
        return rowToTask(row);
    }

    async find(filter: any): Promise<Task[]> {
        let sql = 'SELECT * FROM tasks WHERE 1=1';
        const params: any[] = [];
        
        if (filter && filter.is_deleted !== undefined) {
            sql += ' AND is_deleted = ?';
            params.push(filter.is_deleted ? 1 : 0);
        }

        if (filter && filter.$or && Array.isArray(filter.$or)) {
            const orConditions = filter.$or.map((cond: any) => {
                const keys = Object.keys(cond);
                if (keys.length === 1 && keys[0] === 'sync_status') {
                    params.push(cond.sync_status);
                    return 'sync_status = ?';
                }
                return '';
            }).filter((c: string | any[]) => c.length > 0);

            if (orConditions.length > 0) {
                sql += ` AND (${orConditions.join(' OR ')})`;
            }
        }

        const rows = await this.all(sql, params);
        return rows.map(rowToTask).filter(t => t !== null) as Task[];
    }

    async findTasksModifiedSince(timestamp: Date): Promise<Task[]> {
        const sql = 'SELECT * FROM tasks WHERE updated_at > ?';
        const rows = await this.all(sql, [timestamp.toISOString()]);
        return rows.map(rowToTask).filter(t => t !== null) as Task[];
    }
    
    // ----------------------------------------------------------------------
    // SYNC QUEUE METHODS (The functions that were missing)
    // ----------------------------------------------------------------------
    
    async addToSyncQueue(item: SyncQueueItem): Promise<void> {
        const sql = `
            INSERT INTO sync_queue (id, task_id, operation, data, created_at, retry_count, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await this.run(sql, [
            item.id || uuidv4(),
            item.task_id,
            item.operation,
            JSON.stringify(item.data), 
            item.created_at.toISOString(),
            item.retry_count,
            item.error_message || null,
        ]);
    }

    async getPendingSyncItems(): Promise<SyncQueueItem[]> {
        const sql = 'SELECT * FROM sync_queue ORDER BY created_at ASC';
        const rows = await this.all(sql);
        return rows.map(row => ({
            id: row.id,
            task_id: row.task_id,
            operation: row.operation as SyncQueueItem['operation'],
            // Parse the stored JSON string back into an object
            data: JSON.parse(row.data), 
            created_at: new Date(row.created_at),
            retry_count: row.retry_count,
            error_message: row.error_message,
        }));
    }

    async removeSyncQueueItem(id: string): Promise<void> {
        const sql = 'DELETE FROM sync_queue WHERE id = ?';
        await this.run(sql, [id]);
    }

    // ----------------------------------------------------------------------
    // HELPER METHODS (promisified SQLite wrappers)
    // ----------------------------------------------------------------------

    run(sql: string, params: any[] = []): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    get(sql: string, params: any[] = []): Promise<any> {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    all(sql: string, params: any[] = []): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}
