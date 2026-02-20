import { XSDSchema, XSDElement, XSDImport, XSDInclude } from '../types/xsd';

let elementIdCounter = 0;

export function parseXSD(xmlString: string): XSDSchema {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  
  // Check for parsing errors
  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('XML parsing error: ' + parserError.textContent);
  }

  const schemaElement = xmlDoc.documentElement;
  
  if (schemaElement.localName !== 'schema') {
    throw new Error('Root element must be xs:schema or xsd:schema');
  }

  const schema: XSDSchema = {
    targetNamespace: schemaElement.getAttribute('targetNamespace') || undefined,
    elementFormDefault: schemaElement.getAttribute('elementFormDefault') || undefined,
    attributeFormDefault: schemaElement.getAttribute('attributeFormDefault') || undefined,
    imports: [],
    includes: [],
    elements: []
  };

  // Parse imports
  const imports = schemaElement.querySelectorAll('import');
  imports.forEach(importEl => {
    schema.imports.push({
      namespace: importEl.getAttribute('namespace') || '',
      schemaLocation: importEl.getAttribute('schemaLocation') || ''
    });
  });

  // Parse includes
  const includes = schemaElement.querySelectorAll('include');
  includes.forEach(includeEl => {
    schema.includes.push({
      schemaLocation: includeEl.getAttribute('schemaLocation') || ''
    });
  });

  // Parse top-level elements
  const elements = Array.from(schemaElement.children).filter(
    child => child.localName === 'element'
  );
  
  elements.forEach(element => {
    schema.elements.push(parseElement(element as Element));
  });

  return schema;
}

function parseElement(element: Element): XSDElement {
  const xsdElement: XSDElement = {
    id: `el-${elementIdCounter++}`,
    name: element.getAttribute('name') || 'unnamed',
    type: element.getAttribute('type') || 'string',
    minOccurs: element.getAttribute('minOccurs') || undefined,
    maxOccurs: element.getAttribute('maxOccurs') || undefined,
    enabled: true,
    elementType: 'element',
    children: []
  };

  // Parse nested complexType
  const complexType = element.querySelector(':scope > complexType');
  if (complexType) {
    xsdElement.children = parseComplexType(complexType);
  }

  // Parse nested simpleType
  const simpleType = element.querySelector(':scope > simpleType');
  if (simpleType) {
    const restriction = simpleType.querySelector(':scope > restriction');
    if (restriction) {
      xsdElement.restriction = {
        base: restriction.getAttribute('base') || 'string'
      };
    }
  }

  return xsdElement;
}

function parseComplexType(complexType: Element): XSDElement[] {
  const children: XSDElement[] = [];
  
  // Parse sequence
  const sequence = complexType.querySelector(':scope > sequence');
  if (sequence) {
    const elements = Array.from(sequence.children).filter(
      child => child.localName === 'element'
    );
    elements.forEach(el => {
      children.push(parseElement(el as Element));
    });
  }

  // Parse choice
  const choice = complexType.querySelector(':scope > choice');
  if (choice) {
    const elements = Array.from(choice.children).filter(
      child => child.localName === 'element'
    );
    elements.forEach(el => {
      children.push(parseElement(el as Element));
    });
  }

  // Parse all
  const all = complexType.querySelector(':scope > all');
  if (all) {
    const elements = Array.from(all.children).filter(
      child => child.localName === 'element'
    );
    elements.forEach(el => {
      children.push(parseElement(el as Element));
    });
  }

  return children;
}

export function generateXSD(schema: XSDSchema): string {
  let xsd = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xsd += '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"';
  
  if (schema.targetNamespace) {
    xsd += `\n  targetNamespace="${schema.targetNamespace}"`;
  }
  if (schema.elementFormDefault) {
    xsd += `\n  elementFormDefault="${schema.elementFormDefault}"`;
  }
  if (schema.attributeFormDefault) {
    xsd += `\n  attributeFormDefault="${schema.attributeFormDefault}"`;
  }
  xsd += '>\n\n';

  // Add imports
  schema.imports.forEach(imp => {
    xsd += `  <xs:import namespace="${imp.namespace}" schemaLocation="${imp.schemaLocation}" />\n`;
  });

  // Add includes
  schema.includes.forEach(inc => {
    xsd += `  <xs:include schemaLocation="${inc.schemaLocation}" />\n`;
  });

  if (schema.imports.length > 0 || schema.includes.length > 0) {
    xsd += '\n';
  }

  // Add elements
  schema.elements.forEach(element => {
    if (element.enabled) {
      xsd += generateElement(element, 1);
    }
  });

  xsd += '</xs:schema>';
  return xsd;
}

function generateElement(element: XSDElement, indent: number): string {
  if (!element.enabled) {
    return '';
  }

  const spaces = '  '.repeat(indent);
  let xsd = `${spaces}<xs:element name="${element.name}"`;
  
  if (element.type && (!element.children || element.children.length === 0)) {
    xsd += ` type="${element.type}"`;
  }
  if (element.minOccurs !== undefined) {
    xsd += ` minOccurs="${element.minOccurs}"`;
  }
  if (element.maxOccurs !== undefined) {
    xsd += ` maxOccurs="${element.maxOccurs}"`;
  }

  if (element.children && element.children.length > 0) {
    xsd += '>\n';
    xsd += `${spaces}  <xs:complexType>\n`;
    xsd += `${spaces}    <xs:sequence>\n`;
    
    element.children.forEach(child => {
      if (child.enabled) {
        xsd += generateElement(child, indent + 3);
      }
    });
    
    xsd += `${spaces}    </xs:sequence>\n`;
    xsd += `${spaces}  </xs:complexType>\n`;
    xsd += `${spaces}</xs:element>\n`;
  } else {
    xsd += ' />\n';
  }

  return xsd;
}

export function getDefaultSchema(): XSDSchema {
  return {
    targetNamespace: 'http://example.com/schema',
    elementFormDefault: 'qualified',
    imports: [],
    includes: [],
    elements: [
      {
        id: 'el-1',
        name: 'root',
        type: 'rootType',
        enabled: true,
        elementType: 'element',
        children: [
          {
            id: 'el-2',
            name: 'person',
            type: 'personType',
            minOccurs: '1',
            maxOccurs: 'unbounded',
            enabled: true,
            elementType: 'element',
            children: [
              {
                id: 'el-3',
                name: 'name',
                type: 'xs:string',
                minOccurs: '1',
                maxOccurs: '1',
                enabled: true,
                elementType: 'element'
              },
              {
                id: 'el-4',
                name: 'age',
                type: 'xs:int',
                minOccurs: '0',
                maxOccurs: '1',
                enabled: true,
                elementType: 'element'
              },
              {
                id: 'el-5',
                name: 'email',
                type: 'xs:string',
                minOccurs: '0',
                maxOccurs: '1',
                enabled: true,
                elementType: 'element'
              }
            ]
          }
        ]
      }
    ]
  };
}
