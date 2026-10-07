// src/components/YesNoQuestion.tsx
// A yes/no question with an unanswered state (null): the label is bold until
// it is answered. Used for the mover questions (stairs, elevator, COI).

export default function YesNoQuestion({ label, value, onChange }: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  const btn = (v: boolean) =>
    `px-3 py-1 ${value === v ? (v ? 'bg-amber-500 text-white' : 'bg-gray-700 text-white') : 'bg-white text-gray-600 hover:bg-gray-50'}`;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`text-sm ${value == null ? 'text-gray-800 font-medium' : 'text-gray-700'}`}>{label}</span>
      <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs font-medium shrink-0" role="group" aria-label={label}>
        <button type="button" aria-pressed={value === true} onClick={() => onChange(true)} className={btn(true)}>Yes</button>
        <button type="button" aria-pressed={value === false} onClick={() => onChange(false)} className={`border-l border-gray-300 ${btn(false)}`}>No</button>
      </div>
    </div>
  );
}
