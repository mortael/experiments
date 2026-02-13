export interface XSDElement {
  id: string;
  name: string;
  type: string;
  minOccurs?: string;
  maxOccurs?: string;
  enabled: boolean;
  children?: XSDElement[];
  elementType: 'element' | 'complexType' | 'simpleType' | 'attribute' | 'sequence' | 'choice' | 'all' | 'group';
  dataType?: string;
  restriction?: {
    base: string;
    enumeration?: string[];
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  };
  documentation?: string;
}

export interface XSDImport {
  namespace: string;
  schemaLocation: string;
}

export interface XSDInclude {
  schemaLocation: string;
}

export interface XSDSchema {
  targetNamespace?: string;
  elementFormDefault?: string;
  attributeFormDefault?: string;
  imports: XSDImport[];
  includes: XSDInclude[];
  elements: XSDElement[];
}
