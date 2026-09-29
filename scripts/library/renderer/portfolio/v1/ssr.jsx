import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Portfolio} from './registry.jsx';
export function render(plan,content){return renderToStaticMarkup(<Portfolio plan={plan} content={content}/>);}
