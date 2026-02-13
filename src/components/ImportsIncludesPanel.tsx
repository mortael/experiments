import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { XSDImport, XSDInclude } from '../types/xsd';

interface ImportsIncludesPanelProps {
  imports: XSDImport[];
  includes: XSDInclude[];
  onAddImport: (import_: XSDImport) => void;
  onRemoveImport: (index: number) => void;
  onAddInclude: (include: XSDInclude) => void;
  onRemoveInclude: (index: number) => void;
}

export function ImportsIncludesPanel({
  imports,
  includes,
  onAddImport,
  onRemoveImport,
  onAddInclude,
  onRemoveInclude
}: ImportsIncludesPanelProps) {
  const [showImportForm, setShowImportForm] = useState(false);
  const [showIncludeForm, setShowIncludeForm] = useState(false);
  const [importNamespace, setImportNamespace] = useState('');
  const [importLocation, setImportLocation] = useState('');
  const [includeLocation, setIncludeLocation] = useState('');

  const handleAddImport = () => {
    if (importNamespace && importLocation) {
      onAddImport({
        namespace: importNamespace,
        schemaLocation: importLocation
      });
      setImportNamespace('');
      setImportLocation('');
      setShowImportForm(false);
    }
  };

  const handleAddInclude = () => {
    if (includeLocation) {
      onAddInclude({
        schemaLocation: includeLocation
      });
      setIncludeLocation('');
      setShowIncludeForm(false);
    }
  };

  return (
    <div className="border rounded-lg bg-white p-4 space-y-4">
      <h3 className="text-lg font-semibold">Imports & Includes</h3>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700">Imports</h4>
          <button
            onClick={() => setShowImportForm(!showImportForm)}
            className="flex items-center gap-1 px-2 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            <Plus size={14} />
            Add Import
          </button>
        </div>

        {showImportForm && (
          <div className="mb-3 p-3 border rounded bg-gray-50 space-y-2">
            <input
              type="text"
              placeholder="Namespace"
              value={importNamespace}
              onChange={(e) => setImportNamespace(e.target.value)}
              className="w-full px-2 py-1 text-sm border rounded"
            />
            <input
              type="text"
              placeholder="Schema Location"
              value={importLocation}
              onChange={(e) => setImportLocation(e.target.value)}
              className="w-full px-2 py-1 text-sm border rounded"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddImport}
                className="px-2 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
              >
                Add
              </button>
              <button
                onClick={() => setShowImportForm(false)}
                className="px-2 py-1 text-sm bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-1">
          {imports.map((imp, index) => (
            <div
              key={index}
              className="flex items-start justify-between p-2 bg-gray-50 rounded text-sm"
            >
              <div className="flex-1">
                <div className="font-mono text-xs text-gray-600">
                  ns: {imp.namespace}
                </div>
                <div className="font-mono text-xs text-gray-600">
                  loc: {imp.schemaLocation}
                </div>
              </div>
              <button
                onClick={() => onRemoveImport(index)}
                className="text-red-500 hover:text-red-700"
              >
                <X size={16} />
              </button>
            </div>
          ))}
          {imports.length === 0 && (
            <div className="text-sm text-gray-400 italic">No imports</div>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700">Includes</h4>
          <button
            onClick={() => setShowIncludeForm(!showIncludeForm)}
            className="flex items-center gap-1 px-2 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            <Plus size={14} />
            Add Include
          </button>
        </div>

        {showIncludeForm && (
          <div className="mb-3 p-3 border rounded bg-gray-50 space-y-2">
            <input
              type="text"
              placeholder="Schema Location"
              value={includeLocation}
              onChange={(e) => setIncludeLocation(e.target.value)}
              className="w-full px-2 py-1 text-sm border rounded"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddInclude}
                className="px-2 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
              >
                Add
              </button>
              <button
                onClick={() => setShowIncludeForm(false)}
                className="px-2 py-1 text-sm bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-1">
          {includes.map((inc, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
            >
              <div className="font-mono text-xs text-gray-600 flex-1">
                {inc.schemaLocation}
              </div>
              <button
                onClick={() => onRemoveInclude(index)}
                className="text-red-500 hover:text-red-700"
              >
                <X size={16} />
              </button>
            </div>
          ))}
          {includes.length === 0 && (
            <div className="text-sm text-gray-400 italic">No includes</div>
          )}
        </div>
      </div>
    </div>
  );
}
