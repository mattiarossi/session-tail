import type { TaskStatus } from '~/lib/types';

const CLASSES: Record<TaskStatus, string> = {
  running: 'bg-blue-100 text-blue-800 animate-pulse',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  killed: 'bg-gray-200 text-gray-700',
  unknown: 'bg-gray-100 text-gray-500',
};

export function TaskBadge({ status, exitCode, count }: { status: TaskStatus; exitCode?: number | null; count?: number }) {
  const cls = status === 'completed' && (exitCode ?? 0) > 0 ? CLASSES.failed : CLASSES[status];
  const text = count !== undefined ? `${count} ${status}` : exitCode !== undefined && exitCode !== null ? `${status} · exit ${exitCode}` : status;
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{text}</span>;
}
