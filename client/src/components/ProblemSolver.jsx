import { useState, useRef } from 'react';

export default function ProblemSolver({ onSelect, disabled }) {
  const [problemText, setProblemText] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageFile(file);
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if ((!problemText.trim() && !imageFile) || disabled) return;
    const data = { problemText: problemText.trim() };
    if (imagePreview) {
      // Extract base64 data and mime type from the data URL
      const match = imagePreview.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (match) {
        data.imageMimeType = match[1];
        data.imageBase64 = match[2];
      }
    }
    onSelect('guided', data);
  };

  const hasContent = problemText.trim() || imageFile;

  return (
    <div className="flex flex-col items-center h-full gap-6 p-8 overflow-auto">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-100 mb-2">Problem Solver</h1>
        <p className="text-gray-400">Paste a problem or upload a screenshot and I'll guide you through it</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-lg space-y-4">
        <textarea
          value={problemText}
          onChange={(e) => setProblemText(e.target.value)}
          placeholder="Paste your homework problem, competition question, or describe what you want to explore..."
          rows={8}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-y"
        />

        {/* Image upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        {imagePreview ? (
          <div className="relative inline-block">
            <img
              src={imagePreview}
              alt="Problem screenshot"
              className="max-h-48 rounded-lg border border-gray-700"
            />
            <button
              type="button"
              onClick={removeImage}
              className="absolute -top-2 -right-2 bg-gray-700 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs transition-colors"
            >
              X
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full border border-dashed border-gray-600 hover:border-blue-500 rounded-xl px-4 py-3 text-sm text-gray-400 hover:text-gray-300 transition-colors"
          >
            Upload a screenshot
          </button>
        )}

        <button
          type="submit"
          disabled={!hasContent || disabled}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Guide Me
        </button>
      </form>
    </div>
  );
}
