export default function GuidedOptions({ options, prompt, onSelect }) {
  return (
    <div className="space-y-2">
      {prompt && (
        <p className="text-sm text-gray-300">{prompt}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            onClick={() => onSelect(option.id)}
            className="border border-blue-500 text-blue-400 hover:bg-blue-500/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
