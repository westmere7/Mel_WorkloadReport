import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from './ui/Modal'
import { TaskForm } from './TaskForm'
import { useStore } from '../data/store'
import type { Task, TaskInput } from '../types'

interface NewTaskContextValue {
  openNewTask: () => void
}

const NewTaskContext = createContext<NewTaskContextValue | null>(null)

/** Opens the global "New task" pop-up from anywhere in the app. */
export function useNewTask(): NewTaskContextValue {
  const ctx = useContext(NewTaskContext)
  if (!ctx) throw new Error('useNewTask must be used within <NewTaskProvider>')
  return ctx
}

export function NewTaskProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  // Task opened via "edit the existing task instead" (duplicate-code handoff).
  const [editTask, setEditTask] = useState<Task | null>(null)
  const { createTask, updateTask, tasks } = useStore()
  const navigate = useNavigate()

  // A new task is the most recent, so it takes the next number at the top of the
  // list. This is just its position — it re-flows as tasks are added/removed.
  const nextNo = tasks.length + 1

  const value = useMemo<NewTaskContextValue>(() => ({ openNewTask: () => setOpen(true) }), [])

  const handleSubmit = async (input: TaskInput) => {
    await createTask(input)
    setOpen(false)
    navigate('/tasks')
  }

  return (
    <NewTaskContext.Provider value={value}>
      {children}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={
          <span className="flex items-center gap-2.5">
            New task
            <span
              className="inline-flex items-center rounded-lg border border-line px-2 py-0.5 text-xs font-semibold text-muted"
              title="Its position in the list — re-flows as tasks are added or removed"
            >
              No. {nextNo}
            </span>
          </span>
        }
        wide
        closeOnBackdrop={false}
      >
        <TaskForm
          submitLabel="Register task"
          onSubmit={handleSubmit}
          onCancel={() => setOpen(false)}
          onOpenExisting={(t) => {
            setOpen(false)
            setEditTask(t)
          }}
        />
      </Modal>

      {/* Duplicate-code handoff: edit the task that already owns the code. */}
      <Modal
        open={editTask !== null}
        onClose={() => setEditTask(null)}
        title="Edit task"
        wide
        closeOnBackdrop={false}
      >
        {editTask && (
          <TaskForm
            initial={editTask}
            submitLabel="Save changes"
            onSubmit={async (input) => {
              await updateTask(editTask.id, input)
              setEditTask(null)
            }}
            onCancel={() => setEditTask(null)}
          />
        )}
      </Modal>
    </NewTaskContext.Provider>
  )
}
