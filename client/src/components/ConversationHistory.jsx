import { useEffect } from 'react';

export default function ConversationHistory({ conversations, send, onViewTranscript, onResume }) {
  useEffect(() => {
    send({ type: 'list_conversations' });
  }, [send]);

  if (!conversations || conversations.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        No past sessions yet. Start a guided session to see your history here.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
      <h2 className="text-lg font-semibold text-gray-200 mb-4">Session History</h2>
      {conversations.map((conv) => (
        <div
          key={conv.id}
          className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex items-start justify-between gap-4"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-200 truncate">
              {conv.problem_text || 'Untitled session'}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  conv.status === 'active'
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-green-500/20 text-green-400'
                }`}
              >
                {conv.status === 'active' ? 'In Progress' : 'Complete'}
              </span>
              <span className="text-xs text-gray-500">
                {new Date(conv.updated_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {conv.status === 'active' && (
              <button
                onClick={() => onResume(conv.id)}
                className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
              >
                Resume
              </button>
            )}
            <button
              onClick={() => onViewTranscript(conv.id)}
              className="px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
            >
              View
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
