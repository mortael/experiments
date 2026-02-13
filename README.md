# XSD Editor

A web-based XSD (XML Schema Definition) editor with a tree view interface, similar to XMLSpy.

## Features
- **Tree View Structure**: Visual hierarchy of XSD elements
- **Quick Enable/Disable**: Toggle elements and sections on/off
- **Cardinality Editing**: Easy modification of minOccurs and maxOccurs
- **Format/Type Editing**: Set data types and formats for elements
- **Import Support**: Import external XSD files via xs:import and xs:include
- **File Management**: Load, edit, and save XSD files
- **Visual Indicators**: Icons showing element types, cardinality, and status

## Getting Started
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the dev server:
   ```bash
   npm run dev
   ```
3. Build for production:
   ```bash
   npm run build
   npm run preview
   ```

## Usage
1. **Load XSD File**: Click "Load XSD File" to upload an existing XSD file, or start with the default schema
2. **Navigate Tree**: Expand/collapse elements in the tree view
3. **Edit Elements**:
   - Click on any element to select and edit it
   - Toggle enabled/disabled using the checkbox
   - Modify cardinality (min/max occurs)
   - Change element type and format
4. **Manage Sections**: Enable/disable entire sections using section checkboxes
5. **Import Schemas**: Add xs:import or xs:include statements to reference external schemas
6. **Export**: Download the modified XSD file

## Note on Branch Organization
This repository contains multiple experimental projects, each in a separate branch:
- `main`: Current active project (XSD Editor)
- `midi-generator`: MIDI Pattern Generator project

To switch between projects, use: `git checkout <branch-name>`
