import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Portfolio} from './registry.jsx';
import {portfolioSpec} from './catalog.mjs';
import {fixture} from './fixtures.mjs';
export function render(scenario){return renderToStaticMarkup(<Portfolio spec={portfolioSpec} content={fixture(scenario)}/>);}
