import React from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Check, X } from 'lucide-react';
import { XSDElement } from '../types/xsd';

interface TreeNodeProps {
  element: XSDElement;
  level: number;
  selectedId: string | null;
  onSelect: (element: XSDElement) => void;
  onToggleEnabled: (elementId: string, enabled: boolean) => void;
  onToggleExpanded: (elementId: string) => void;
  expandedIds: Set<string>;
}

export function TreeNode({ 
  element, 
  level, 
  selectedId, 
  onSelect, 
  onToggleEnabled,
  onToggleExpanded,
  expandedIds
}: TreeNodeProps) {
  const hasChildren = element.children && element.children.length > 0;
  const isExpanded = expandedIds.has(element.id);
  const isSelected = selectedId === element.id;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      onToggleExpanded(element.id);
    }
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onToggleEnabled(element.id, e.target.checked);
  };

  const getCardinalityText = () => {
    if (!element.minOccurs && !element.maxOccurs) return '';
    const min = element.minOccurs || '1';
    const max = element.maxOccurs || '1';
    return `[${min}..${max}]`;
  };

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-1 px-2 cursor-pointer hover:bg-gray-100 ${
          isSelected ? 'bg-blue-100 hover:bg-blue-100' : ''
        }`}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        onClick={() => onSelect(element)}
      >
        <button
          onClick={handleToggle}
          className="w-4 h-4 flex items-center justify-center"
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )
          ) : (
            <span className="w-4" />
          )}
        </button>

        <input
          type="checkbox"
          checked={element.enabled}
          onChange={handleCheckboxChange}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4"
        />

        {hasChildren ? (
          isExpanded ? <FolderOpen size={16} className="text-yellow-600" /> : <Folder size={16} className="text-yellow-600" />
        ) : (
          <File size={16} className="text-blue-600" />
        )}

        <span className={`flex-1 ${!element.enabled ? 'text-gray-400 line-through' : ''}`}>
          {element.name}
        </span>

        {!element.enabled && <X size={14} className="text-red-500" />}
        {element.enabled && <Check size={14} className="text-green-500" />}

        <span className="text-xs text-gray-500 font-mono">
          {element.type}
        </span>

        {getCardinalityText() && (
          <span className="text-xs text-purple-600 font-mono">
            {getCardinalityText()}
          </span>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div>
          {element.children!.map((child) => (
            <TreeNode
              key={child.id}
              element={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onToggleEnabled={onToggleEnabled}
              onToggleExpanded={onToggleExpanded}
              expandedIds={expandedIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}
