import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Portfolio} from '../portfolio/registry.jsx';
export function render(spec,content){return renderToStaticMarkup(<Portfolio spec={spec} content={content}/>);}
