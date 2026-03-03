import { useState } from 'react';
import MathText from './MathText';

export default function GuidedOptions({ options, prompt, mode, inputPlaceholder, onSelect }) {
  const [text, setText] = useState('');

  const handleSubmitText = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSelect({ text: text.trim() });
    setText('');
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
