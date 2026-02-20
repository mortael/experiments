import React from 'react';
import { TreeNode } from './TreeNode';
import { XSDElement } from '../types/xsd';

interface TreeViewProps {
  elements: XSDElement[];
  selectedId: string | null;
  onSelect: (element: XSDElement) => void;
  onToggleEnabled: (elementId: string, enabled: boolean) => void;
  expandedIds: Set<string>;
  onToggleExpanded: (elementId: string) => void;
}

export function TreeView({ 
  elements, 
  selectedId, 
  onSelect, 
  onToggleEnabled,
  expandedIds,
  onToggleExpanded
}: TreeViewProps) {
  return (
    <div className="border rounded-lg bg-white overflow-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
      {elements.map((element) => (
        <TreeNode
          key={element.id}
          element={element}
          level={0}
          selectedId={selectedId}
          onSelect={onSelect}
          onToggleEnabled={onToggleEnabled}
          onToggleExpanded={onToggleExpanded}
          expandedIds={expandedIds}
        />
      ))}
    </div>
  );
}
