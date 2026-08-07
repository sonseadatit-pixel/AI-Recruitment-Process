interface SkillTagProps {
  label: string;
  variant?: 'matched' | 'missing';
}

export default function SkillTag({ label, variant = 'matched' }: SkillTagProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${variant === 'matched' ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200' : 'bg-red-50 text-red-600 ring-1 ring-red-200'}`}
    >
      {variant === 'matched' ? '✓ ' : '✗ '}
      {label}
    </span>
  );
}
