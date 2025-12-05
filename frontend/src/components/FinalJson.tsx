
import React from 'react';
import { SelectionRecord, FinalOutputItem, AssessmentVariant } from '../types/types';
import { Check, Copy } from 'lucide-react';
import { buildFinalBookSelections } from '../lib/bookSelectionUtils';

interface FinalJsonProps {
  selections: SelectionRecord[];
  excludedAssessments: string[];
  assessmentVariants: Record<string, AssessmentVariant>;
  customAssessmentTitles: Record<string, string>;
  gradeNames: Record<string, string>;
  onReset: () => void;
}

const FinalJson: React.FC<FinalJsonProps> = ({
  selections,
  excludedAssessments,
  assessmentVariants,
  customAssessmentTitles,
  gradeNames,
  onReset
}) => {
  const [copied, setCopied] = React.useState(false);

  const finalData: FinalOutputItem[] = buildFinalBookSelections(
    selections,
    excludedAssessments,
    assessmentVariants,
    customAssessmentTitles,
    gradeNames
  );

  const jsonString = JSON.stringify(finalData, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8">
        <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Check className="text-green-500" />
          Configuration Complete
        </h2>
        <p className="text-slate-600 mb-6">
          Here is the final configuration for your book selection.
        </p>

        <div className="relative mb-6">
          <div className="absolute top-2 right-2">
            <button 
              onClick={handleCopy}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md transition-colors"
              title="Copy JSON"
            >
              {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
            </button>
          </div>
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm font-mono leading-relaxed h-96">
            {jsonString}
          </pre>
        </div>

        <div className="flex justify-center">
            <button 
                onClick={onReset}
                className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
                Start New Selection
            </button>
        </div>
      </div>
    </div>
  );
};

export default FinalJson;
