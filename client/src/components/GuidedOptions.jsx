import { useState } from 'react';
import MathText from './MathText';

export default function GuidedOptions({ options, prompt, mode, inputPlaceholder, multiSelect, onSelect }) {
  const [text, setText] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());

  const handleSubmitText = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSelect({ text: text.trim() });
    setText('');
  };

  const handleToggle = (option) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(option.id)) {
        next.delete(option.id);
      } else {
        next.add(option.id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (selectedIds.size === 0) return;
    const selected = (options || []).filter((o) => selectedIds.has(o.id));
    onSelect({
      optionIds: selected.map((o) => o.id),
      labels: selected.map((o) => o.label),
    });
    setSelectedIds(new Set());
  };

  return (
    <div className="space-y-2">
      {prompt && (
        <p className="text-sm text-gray-300"><MathText>{prompt}</MathText></p>
      )}
      {mode === 'open_ended' ? (
        <form onSubmit={handleSubmitText} className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={inputPlaceholder || 'Type your answer...'}
            className="flex-1 bg-gray-800 border border-blue-500 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-400"
            autoFocus
          />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Submit
          </button>
        </form>
      ) : multiSelect ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {(options || []).map((option) => (
              <button
                key={option.id}
                onClick={() => handleToggle(option)}
                className={`border px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedIds.has(option.id)
                    ? 'border-blue-400 bg-blue-500/30 text-blue-300'
                    : 'border-blue-500 text-blue-400 hover:bg-blue-500/20'
                }`}
              >
                <MathText>{option.label}</MathText>
              </button>
            ))}
          </div>
          <button
            onClick={handleConfirm}
            disabled={selectedIds.size === 0}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedIds.size > 0
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            Confirm ({selectedIds.size} selected)
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {(options || []).map((option) => (
            <button
              key={option.id}
              onClick={() => onSelect({ optionId: option.id, label: option.label })}
              className="border border-blue-500 text-blue-400 hover:bg-blue-500/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <MathText>{option.label}</MathText>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
