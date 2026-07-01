import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from './ui/Modal'
import { TaskForm } from './TaskForm'
import { useStore } from '../data/store'
import type { TaskInput } from '../types'

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
  const { createTask } = useStore()
  const navigate = useNavigate()

  const value = useMemo<NewTaskContextValue>(() => ({ openNewTask: () => setOpen(true) }), [])

  const handleSubmit = async (input: TaskInput) => {
    await createTask(input)
    setOpen(false)
    navigate('/tasks')
  }

  return (
    <NewTaskContext.Provider value={value}>
      {children}
      <Modal open={open} onClose={() => setOpen(false)} title="New task" wide closeOnBackdrop={false}>
        <TaskForm submitLabel="Register task" onSubmit={handleSubmit} onCancel={() => setOpen(false)} />
      </Modal>
    </NewTaskContext.Provider>
  )
}
