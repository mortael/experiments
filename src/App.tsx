import React, { useState, useCallback } from 'react';
import { Upload, Download, FileText, RefreshCw } from 'lucide-react';
import { TreeView } from './components/TreeView';
import { PropertyPanel } from './components/PropertyPanel';
import { ImportsIncludesPanel } from './components/ImportsIncludesPanel';
import { XSDSchema, XSDElement, XSDImport, XSDInclude } from './types/xsd';
import { parseXSD, generateXSD, getDefaultSchema } from './utils/xsdParser';

function App() {
  const [schema, setSchema] = useState<XSDSchema>(getDefaultSchema());
  const [selectedElement, setSelectedElement] = useState<XSDElement | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(['el-1', 'el-2']));
  const [fileName, setFileName] = useState<string>('schema.xsd');

  const findElementById = useCallback((elements: XSDElement[], id: string): XSDElement | null => {
    for (const element of elements) {
      if (element.id === id) {
        return element;
      }
      if (element.children) {
        const found = findElementById(element.children, id);
        if (found) return found;
      }
    }
    return null;
  }, []);

  const updateElementById = useCallback((
    elements: XSDElement[],
    id: string,
    updates: Partial<XSDElement>
  ): XSDElement[] => {
    return elements.map((element) => {
      if (element.id === id) {
        return { ...element, ...updates };
      }
      if (element.children) {
        return {
          ...element,
          children: updateElementById(element.children, id, updates)
        };
      }
      return element;
    });
  }, []);

  const handleToggleEnabled = useCallback((elementId: string, enabled: boolean) => {
    setSchema((prev) => ({
      ...prev,
      elements: updateElementById(prev.elements, elementId, { enabled })
    }));
    
    if (selectedElement?.id === elementId) {
      setSelectedElement((prev) => prev ? { ...prev, enabled } : null);
    }
  }, [selectedElement, updateElementById]);

  const handleToggleExpanded = useCallback((elementId: string) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(elementId)) {
        newSet.delete(elementId);
      } else {
        newSet.add(elementId);
      }
      return newSet;
    });
  }, []);

  const handleSelectElement = useCallback((element: XSDElement) => {
    setSelectedElement(element);
  }, []);

  const handleUpdateElement = useCallback((updates: Partial<XSDElement>) => {
    if (!selectedElement) return;

    const updatedElements = updateElementById(schema.elements, selectedElement.id, updates);
    setSchema((prev) => ({ ...prev, elements: updatedElements }));
    
    const updatedElement = findElementById(updatedElements, selectedElement.id);
    if (updatedElement) {
      setSelectedElement(updatedElement);
    }
  }, [selectedElement, schema.elements, updateElementById, findElementById]);

  const handleLoadFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xsd,.xml';
    
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setFileName(file.name);
      const reader = new FileReader();
      
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const parsedSchema = parseXSD(content);
          setSchema(parsedSchema);
          setSelectedElement(null);
          
          // Auto-expand first level
          const firstLevelIds = parsedSchema.elements.map(el => el.id);
          setExpandedIds(new Set(firstLevelIds));
        } catch (error) {
          alert('Error parsing XSD file: ' + (error as Error).message);
        }
      };
      
      reader.readAsText(file);
    };
    
    input.click();
  }, []);

  const handleDownload = useCallback(() => {
    try {
      const xsdContent = generateXSD(schema);
      const blob = new Blob([xsdContent], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Error generating XSD: ' + (error as Error).message);
    }
  }, [schema, fileName]);

  const handleReset = useCallback(() => {
    if (confirm('Are you sure you want to reset to the default schema?')) {
      setSchema(getDefaultSchema());
      setSelectedElement(null);
      setExpandedIds(new Set(['el-1', 'el-2']));
      setFileName('schema.xsd');
    }
  }, []);

  const handleAddImport = useCallback((import_: XSDImport) => {
    setSchema((prev) => ({
      ...prev,
      imports: [...prev.imports, import_]
    }));
  }, []);

  const handleRemoveImport = useCallback((index: number) => {
    setSchema((prev) => ({
      ...prev,
      imports: prev.imports.filter((_, i) => i !== index)
    }));
  }, []);

  const handleAddInclude = useCallback((include: XSDInclude) => {
    setSchema((prev) => ({
      ...prev,
      includes: [...prev.includes, include]
    }));
  }, []);

  const handleRemoveInclude = useCallback((index: number) => {
    setSchema((prev) => ({
      ...prev,
      includes: prev.includes.filter((_, i) => i !== index)
    }));
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText size={32} className="text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">XSD Editor</h1>
                <p className="text-sm text-gray-500">XML Schema Definition Editor</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleLoadFile}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Upload size={18} />
                Load XSD File
              </button>
              
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download size={18} />
                Download
              </button>
              
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                <RefreshCw size={18} />
                Reset
              </button>
            </div>
          </div>
          
          <div className="mt-2 text-sm text-gray-600">
            Current file: <span className="font-mono font-semibold">{fileName}</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold mb-2">Schema Tree</h2>
              <TreeView
                elements={schema.elements}
                selectedId={selectedElement?.id || null}
                onSelect={handleSelectElement}
                onToggleEnabled={handleToggleEnabled}
                expandedIds={expandedIds}
                onToggleExpanded={handleToggleExpanded}
              />
            </div>
          </div>

          <div className="col-span-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">Properties</h2>
              <PropertyPanel
                element={selectedElement}
                onUpdate={handleUpdateElement}
              />
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">External Schemas</h2>
              <ImportsIncludesPanel
                imports={schema.imports}
                includes={schema.includes}
                onAddImport={handleAddImport}
                onRemoveImport={handleRemoveImport}
                onAddInclude={handleAddInclude}
                onRemoveInclude={handleRemoveInclude}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
