import MathText from './MathText';

const TYPE_STYLES = {
  narration: 'text-gray-300',
  guided_question: 'text-gray-300',
  guided_answer: 'text-green-400',
  student_message: 'text-emerald-400',
  conversational_reply: 'text-purple-300',
};

export default function ConversationTranscript({ messages, onBack }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button
        onClick={onBack}
        className="mb-4 text-sm text-gray-400 hover:text-gray-200 transition-colors"
      >
        &larr; Back to History
      </button>
      <div className="space-y-3">
        {messages.map((msg) => {
          const style = TYPE_STYLES[msg.type] || 'text-gray-300';
          const isStudent = msg.role === 'student';
          return (
            <div
              key={msg.id}
              className={`text-sm ${isStudent ? 'pl-4 border-l-2 border-emerald-600' : ''}`}
            >
              <span className="text-xs text-gray-500 mr-2">
                {isStudent ? 'You' : 'Argmax'}
              </span>
              <span className={style}>
                <MathText text={msg.content} />
              </span>
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="text-gray-500 text-sm text-center">No messages in this session.</p>
        )}
      </div>
    </div>
  );
}
