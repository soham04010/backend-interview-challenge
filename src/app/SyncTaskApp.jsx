import React, { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = 'https://backend-interview-challenge-6hxjmtjbi-sohams-projects-b917a6f6.vercel.app/api'; 

const useTaskStore = () => {
    const [tasks, setTasks] = useState([]);
    const [syncQueue, setSyncQueue] = useState([]);
    const [isOnline, setIsOnline] = useState(true);

    const addTask = (title) => {
        const newId = crypto.randomUUID();
        const now = new Date().toISOString();
        
        const newTask = {
            id: newId,
            title: title,
            completed: false,
            updated_at: now,
            is_deleted: false,
            sync_status: 'pending',
        };

        setTasks(prev => [...prev, newTask]);
        
        const newItem = {
            id: crypto.randomUUID(),
            task_id: newId,
            operation: 'create',
            data: { ...newTask, sync_status: 'pending' },
        };
        setSyncQueue(prev => [...prev, newItem]);
    };

    const updateTask = (id, updates) => {
        const now = new Date().toISOString();
        
        setTasks(prev => prev.map(task => {
            if (task.id === id) {
                const updatedTask = {
                    ...task,
                    ...updates,
                    updated_at: now,
                    sync_status: 'pending',
                };

                const newItem = {
                    id: crypto.randomUUID(),
                    task_id: id,
                    operation: 'update',
                    data: updates,
                };
                setSyncQueue(q => [...q, newItem]);
                
                return updatedTask;
            }
            return task;
        }));
    };

    const deleteTask = (id) => {
        const now = new Date().toISOString();
        
        setTasks(prev => prev.map(task => {
            if (task.id === id) {
                const deletedTask = {
                    ...task,
                    is_deleted: true,
                    updated_at: now,
                    sync_status: 'pending',
                };

                const newItem = {
                    id: crypto.randomUUID(),
                    task_id: id,
                    operation: 'delete',
                    data: { is_deleted: true },
                };
                setSyncQueue(q => [...q, newItem]);
                
                return deletedTask;
            }
            return task;
        }));
    };

    const applyServerChanges = useCallback((serverChanges) => {
        if (!serverChanges || serverChanges.length === 0) return;

        setTasks(prevTasks => {
            const updatedTasksMap = new Map(prevTasks.map(task => [task.id, task]));

            serverChanges.forEach(serverTask => {
                
                if (serverTask.is_deleted) {
                    updatedTasksMap.delete(serverTask.id);
                } else {
                    updatedTasksMap.set(serverTask.id, { ...serverTask, sync_status: 'synced' });
                }
            });

            return Array.from(updatedTasksMap.values()).filter(t => !t.is_deleted);
        });

        setSyncQueue([]); 
    }, []);

    return { 
        tasks: tasks.filter(t => !t.is_deleted), 
        syncQueue, 
        addTask, 
        updateTask, 
        deleteTask,
        applyServerChanges,
        isOnline,
        setIsOnline
    };
};

const App = () => {
    const { 
        tasks, 
        syncQueue, 
        addTask, 
        updateTask, 
        deleteTask,
        applyServerChanges,
        isOnline,
        setIsOnline
    } = useTaskStore();
    
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [lastSyncTime, setLastSyncTime] = useState(new Date(0));
    const [syncLog, setSyncLog] = useState([]);
    const [loading, setLoading] = useState(false);
    
    const checkConnectivity = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/sync/health`);
            setIsOnline(response.ok);
            return response.ok;
        } catch {
            setIsOnline(false);
            return false;
        }
    }, [setIsOnline]);

    const handleSync = useCallback(async () => {
        if (!isOnline) {
            setSyncLog(prev => [{ time: new Date().toLocaleTimeString(), message: 'Offline. Sync deferred.' }, ...prev]);
            return;
        }

        if (syncQueue.length === 0) {
            setSyncLog(prev => [{ time: new Date().toLocaleTimeString(), message: 'No pending items to sync.' }, ...prev]);
            return;
        }
        
        setLoading(true);
        setSyncLog(prev => [{ time: new Date().toLocaleTimeString(), message: `Starting sync for ${syncQueue.length} items...` }, ...prev]);

        try {
            const batchRequest = {
                items: syncQueue,
                client_timestamp: lastSyncTime.toISOString(),
            };
            
            const response = await fetch(`${API_BASE_URL}/sync/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(batchRequest),
            });

            if (!response.ok) {
                throw new Error(`Server returned status ${response.status}`);
            }

            const syncResponse = await response.json();

            const serverChanges = syncResponse.processed_items.filter(item => 
                item.status === 'success' || item.status === 'conflict'
            ).map(item => item.resolved_data).filter(Boolean);

            applyServerChanges(serverChanges);
            
            const syncedCount = syncResponse.processed_items.filter(i => i.status !== 'error').length;
            const conflictCount = syncResponse.processed_items.filter(i => i.status === 'conflict').length;
            
            setSyncLog(prev => [{ time: new Date().toLocaleTimeString(), message: `Sync successful! ${syncedCount} items processed. Conflicts: ${conflictCount}` }, ...prev]);
            
            setLastSyncTime(new Date()); 

        } catch (error) {
            setSyncLog(prev => [{ time: new Date().toLocaleTimeString(), message: `Sync failed: ${error.message}. Retrying later.` }, ...prev]);
        } finally {
            setLoading(false);
        }
    }, [syncQueue, lastSyncTime, isOnline, applyServerChanges]);

    useEffect(() => {
        checkConnectivity();
        const connectivityInterval = setInterval(checkConnectivity, 10000);
        const syncInterval = setInterval(handleSync, 20000); 

        return () => {
            clearInterval(connectivityInterval);
            clearInterval(syncInterval);
        };
    }, [checkConnectivity, handleSync]);
    
    const handleAdd = (e) => {
        e.preventDefault();
        if (newTaskTitle.trim()) {
            addTask(newTaskTitle.trim());
            setNewTaskTitle('');
        }
    };

    const getTaskStatusColor = (task) => {
        if (task.sync_status === 'pending') return 'bg-yellow-100 text-yellow-800';
        if (task.sync_status === 'error') return 'bg-red-100 text-red-800';
        return 'bg-green-100 text-green-800';
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8 font-sans">
            <script src="https://cdn.tailwindcss.com"></script>
            <div className="max-w-4xl mx-auto">
                <header className="py-6 border-b border-gray-200">
                    <h1 className="text-3xl font-extrabold text-gray-900">Offline-First Task Manager</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Client status: <span className={`font-medium ${isOnline ? 'text-green-600' : 'text-red-600'}`}>
                            {isOnline ? 'ONLINE' : 'OFFLINE'}
                        </span>. Pending items: <span className="font-bold text-blue-600">{syncQueue.length}</span>
                    </p>
                </header>

                <main className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    <div className="lg:col-span-2 bg-white shadow-xl rounded-lg p-6">
                        <h2 className="text-xl font-semibold text-gray-800 mb-4">My Tasks ({tasks.length})</h2>

                        <form onSubmit={handleAdd} className="flex space-x-2 mb-6">
                            <input
                                type="text"
                                value={newTaskTitle}
                                onChange={(e) => setNewTaskTitle(e.target.value)}
                                placeholder="Add a new task..."
                                className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                            />
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-5 py-3 bg-blue-600 text-white font-medium rounded-lg shadow-md hover:bg-blue-700 transition duration-150 disabled:bg-gray-400"
                            >
                                {loading ? 'Processing...' : 'Add Task'}
                            </button>
                        </form>

                        <div className="space-y-3">
                            {tasks.map((task) => (
                                <div key={task.id} className="flex items-center p-4 bg-gray-50 rounded-lg border border-gray-200 shadow-sm transition hover:shadow-md">
                                    
                                    <input
                                        type="checkbox"
                                        checked={task.completed}
                                        onChange={() => updateTask(task.id, { completed: !task.completed })}
                                        className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-4"
                                    />
                                    
                                    <div className="flex-1">
                                        <p className={`text-gray-800 font-medium ${task.completed ? 'line-through text-gray-500' : ''}`}>
                                            {task.title}
                                        </p>
                                        <div className="flex space-x-2 text-xs mt-1">
                                            <span className={`px-2 py-0.5 rounded-full font-semibold ${getTaskStatusColor(task)}`}>
                                                {task.sync_status.toUpperCase()}
                                            </span>
                                            {task.sync_status === 'pending' && (
                                                <span className="text-gray-600 italic">Last Modified: {new Date(task.updated_at).toLocaleTimeString()}</span>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <button
                                        onClick={() => deleteTask(task.id)}
                                        className="text-red-500 p-2 rounded-full hover:bg-red-50 transition duration-150"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3"></path></svg>
                                    </button>
                                </div>
                            ))}
                            {tasks.length === 0 && (
                                <p className="text-center text-gray-500 p-4 border rounded-lg">No tasks yet. Add one above!</p>
                            )}
                        </div>
                    </div>

                    <div className="lg:col-span-1 bg-white shadow-xl rounded-lg p-6">
                        <h2 className="text-xl font-semibold text-gray-800 mb-4">Synchronization Panel</h2>
                        
                        <button
                            onClick={handleSync}
                            disabled={loading || syncQueue.length === 0 || !isOnline}
                            className="w-full px-4 py-3 mb-4 bg-green-600 text-white font-medium rounded-lg shadow-md hover:bg-green-700 transition duration-150 disabled:bg-gray-400"
                        >
                            {loading ? 'SYNCING...' : `Sync Now (${syncQueue.length} Pending)`}
                        </button>

                        <p className="text-sm text-gray-600 mb-3">
                            Last Server Sync: {lastSyncTime.getTime() === 0 ? 'Never' : lastSyncTime.toLocaleTimeString()}
                        </p>

                        <div className="border border-gray-300 rounded-lg h-64 overflow-y-scroll p-3 bg-gray-50">
                            <h3 className="text-sm font-bold text-gray-700 mb-2 sticky top-0 bg-gray-50">Sync Log:</h3>
                            <div className="space-y-1">
                                {syncLog.map((log, index) => (
                                    <div key={index} className="text-xs text-gray-700">
                                        <span className="font-mono text-gray-500 mr-2">[{log.time}]</span>
                                        {log.message}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                </main>
            </div>
        </div>
    );
};

export default App;
