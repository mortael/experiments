import React from 'react';
import { XSDElement } from '../types/xsd';

interface PropertyPanelProps {
  element: XSDElement | null;
  onUpdate: (updates: Partial<XSDElement>) => void;
}

const commonTypes = [
  'xs:string',
  'xs:int',
  'xs:integer',
  'xs:decimal',
  'xs:boolean',
  'xs:date',
  'xs:dateTime',
  'xs:time',
  'xs:duration',
  'xs:double',
  'xs:float',
  'xs:anyURI',
  'xs:base64Binary',
  'xs:hexBinary',
  'xs:normalizedString',
  'xs:token'
];

export function PropertyPanel({ element, onUpdate }: PropertyPanelProps) {
  if (!element) {
    return (
      <div className="border rounded-lg bg-white p-4">
        <p className="text-gray-500 text-center">Select an element to edit its properties</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg bg-white p-4 space-y-4">
      <h3 className="text-lg font-semibold mb-4">Element Properties</h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Name
        </label>
        <input
          type="text"
          value={element.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Type
        </label>
        <select
          value={element.type}
          onChange={(e) => onUpdate({ type: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {commonTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
          <option value="custom">Custom Type</option>
        </select>
      </div>

      {element.type === 'custom' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Custom Type Name
          </label>
          <input
            type="text"
            value={element.dataType || ''}
            onChange={(e) => onUpdate({ dataType: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter custom type name"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Min Occurs
          </label>
          <input
            type="text"
            value={element.minOccurs || ''}
            onChange={(e) => onUpdate({ minOccurs: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Max Occurs
          </label>
          <input
            type="text"
            value={element.maxOccurs || ''}
            onChange={(e) => onUpdate({ maxOccurs: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="1 or unbounded"
          />
        </div>
      </div>

      <div>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={element.enabled}
            onChange={(e) => onUpdate({ enabled: e.target.checked })}
            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">
            Enabled
          </span>
        </label>
      </div>

      <div className="pt-4 border-t">
        <div className="text-xs text-gray-500 space-y-1">
          <div><strong>Element Type:</strong> {element.elementType}</div>
          <div><strong>ID:</strong> {element.id}</div>
          {element.children && element.children.length > 0 && (
            <div><strong>Children:</strong> {element.children.length}</div>
          )}
        </div>
      </div>
    </div>
  );
}
