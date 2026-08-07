import { SparkIcon } from './icons';

const map: Record<string, string> = {
  shortlisted: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  'ai-suggested': 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  pending: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
  rejected: 'bg-red-50 text-red-600 ring-1 ring-red-200',
  new: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200',
  screened: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  hired: 'bg-emerald-600 text-white',
  Active: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  Closed: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
  open: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  closed: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
};

const labels: Record<string, string> = {
  'ai-suggested': 'AI Suggested',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] ?? map.pending}`}
    >
      {status === 'ai-suggested' && <SparkIcon width={9} height={9} strokeWidth={2.5} />}
      {labels[status] ?? status}
    </span>
  );
}
