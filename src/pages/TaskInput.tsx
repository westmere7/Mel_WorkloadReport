import { useNavigate } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { TaskForm } from '../components/TaskForm'
import { useStore } from '../data/store'
import type { TaskInput as TaskInputModel } from '../types'

export function TaskInput() {
  const { createTask } = useStore()
  const navigate = useNavigate()

  const handleSubmit = async (input: TaskInputModel) => {
    await createTask(input)
    navigate('/tasks')
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Card>
        <p className="mb-5 text-sm text-muted">
          Register a new task into the workload report. Fields marked with a value are pre-filled with
          sensible defaults — only the task name is strictly required.
        </p>
        <TaskForm submitLabel="Register task" onSubmit={handleSubmit} onCancel={() => navigate('/tasks')} />
      </Card>
    </div>
  )
}
