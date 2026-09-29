import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {StateProvider,VisibilityProvider,ActionProvider,Renderer} from '@json-render/react';
import {Portfolio,registry} from './registry.jsx';
export function render(plan,content){return renderToStaticMarkup(<Portfolio plan={plan} content={content}/>);}
export function renderSpec(spec,state){return renderToStaticMarkup(<StateProvider initialState={state}><VisibilityProvider><ActionProvider handlers={{}}><Renderer spec={spec} registry={registry}/></ActionProvider></VisibilityProvider></StateProvider>);}
