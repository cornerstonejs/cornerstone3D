import type { SVGCursorDescriptor } from '../types';

/*
 * Definitions
 */

const BASE: SVGCursorDescriptor = {
  iconContent: '',
  iconSize: 16,
  viewBox: {
    x: 16,
    y: 16,
  },
  mousePoint: {
    x: 8,
    y: 8,
  },
  mousePointerGroupString: `
    <path stroke="{{color}}" d="M8 16L8 0"></path>
    <path stroke="{{color}}" d="M16 8L0 8"></path>
  `,
};

const SEGMENTATION_CURSOR_BOUNDARIES = {
  x: 127,
  y: 60,
};

const MINUS_RECT = `
<rect fill="{{color}}" x="80.19" y="25.03" width="47.14" height="15.85"/>
`;

const PLUS_RECT = `
<rect fill="{{color}}" x="80.19" y="25.03" width="47.14" height="15.85"/>
<rect fill="{{color}}" x="95.84" y="9.38" width="15.85" height="47.14"/>
`;

const SCISSOR_ICON = `<path fill="{{color}}" d="M82.89,10a12.09,12.09,0,0,0-16.8-2.5l-27.5,20.4-8.5-6.3a2.93,2.93,0,0,1-1.1-3,14.66,14.66,0,0,0,.1-6.6,14.08,14.08,0,1,0-6.5,15.2,2.87,2.87,0,0,1,3.2.2l8.2,6.1-8.2,6.1a2.87,2.87,0,0,1-3.2.2,14.16,14.16,0,1,0,6.7,14.4,14,14,0,0,0-.3-5.8,2.93,2.93,0,0,1,1.1-3l8.5-6.3,27.5,20.4A11.91,11.91,0,0,0,82.89,57l-31.7-23.5ZM15.29,21a5.9,5.9,0,1,1,5.9-5.9A5.91,5.91,0,0,1,15.29,21Zm0,36.8a5.9,5.9,0,1,1,5.9-5.9A5.91,5.91,0,0,1,15.29,57.77Zm28.3-21.5a2.8,2.8,0,1,1,2.8-2.8A2.8,2.8,0,0,1,43.59,36.27Z" transform="translate(-1.17 -0.96)"/>`;
const RECTANGLE_ICON = `<path fill="{{color}}" d="M8.86,2.25V66.08H72.69V2.25H8.86ZM65.28,58.67h-49v-49h49v49Z" transform="translate(-8.86 -2.25)"/>`;
const CIRCLE_ICON = `<path fill="{{color}}" d="M40.77,2.25A31.92,31.92,0,1,0,72.69,34.16,31.92,31.92,0,0,0,40.77,2.25Zm0,57.63A25.71,25.71,0,1,1,66.48,34.16,25.71,25.71,0,0,1,40.77,59.87Z" transform="translate(-8.86 -2.25)"/>`;

const CursorSVG: Record<string, SVGCursorDescriptor> = {
  Angle: extend(BASE, {
    name: 'Angle',
    iconContent: `<path fill="{{color}}" d="M1203 544q0 13-10 23l-393 393 393 393q10 10 10 23t-10 23l-50
    50q-10 10-23 10t-23-10l-466-466q-10-10-10-23t10-23l466-466q10-10 23-10t23
    10l50 50q10 10 10 23z" />`,
    viewBox: {
      x: 1792,
      y: 1792,
    },
  }),
  ArrowAnnotate: extend(BASE, {
    name: 'ArrowAnnotate',
    iconContent: `<g id="arrowAnnotate-group" fill="none" stroke-width="1" stroke="{{color}}" stroke-linecap="round" stroke-linejoin="round">
    <path id="arrowAnnotate-arrow" d="M23,7 l-15,15 M7,17 l0,6 6,0" stroke-width="2" />
  </g>`,
    viewBox: {
      x: 24,
      y: 24,
    },
  }),
  Bidirectional: extend(BASE, {
    name: 'Bidirectional',
    iconContent: `<g fill="{{color}}" stroke-width="3" stroke="{{color}}">
    <path d="M27.63 3.21L3.12 28.81"></path>
    <path d="M27.63 15.75L15.27 4.43"></path>
    <path d="M16.5 4.28C16.5 4.96 15.95 5.51 15.27 5.51C14.59 5.51 14.03 4.96 14.03 4.28C14.03 3.59 14.59 3.04 15.27 3.04C15.95 3.04 16.5 3.59 16.5 4.28Z" ></path>
    <path d="M28.87 3.19C28.87 3.87 28.31 4.43 27.63 4.43C26.95 4.43 26.4 3.87 26.4 3.19C26.4 2.51 26.95 1.95 27.63 1.95C28.31 1.95 28.87 2.51 28.87 3.19Z"></path>
    <path d="M28.87 15.75C28.87 16.43 28.31 16.99 27.63 16.99C26.95 16.99 26.4 16.43 26.4 15.75C26.4 15.07 26.95 14.51 27.63 14.51C28.31 14.51 28.87 15.07 28.87 15.75Z"></path>
    <path d="M4.73 28.44C4.73 29.12 4.17 29.68 3.49 29.68C2.81 29.68 2.25 29.12 2.25 28.44C2.25 27.76 2.81 27.2 3.49 27.2C4.17 27.2 4.73 27.76 4.73 28.44Z"></path>
  </g>`,
    viewBox: {
      x: 48,
      y: 48,
    },
  }),
  CobbAngle: extend(BASE, {
    name: 'CobbAngle',
    iconContent: `<g stroke="{{color}}" stroke-width="3">
    <path d="M28.59 2.34L3.82 12.32"></path>
    <path d="M28.59 29.66L3.82 19.68"></path>
    <path stroke-dasharray="2" fill-opacity="0" d="M12.37
      23.06C12.67 22.36 12.85 21.93 12.92 21.76C14.6 17.8 14.68 13.35 13.15
      9.33C13.11 9.24 13.02 9 12.88 8.63">
    </path>
  </g>`,
    viewBox: {
      x: 32,
      y: 32,
    },
  }),
  CircleROI: extend(BASE, {
    name: 'CircleROI',
    iconContent: `<circle stroke="{{color}}" fill="none" stroke-width="3" cx="16" cy="16" r="14" />`,
    viewBox: {
      x: 32,
      y: 32,
    },
  }),
  EllipticalROI: extend(BASE, {
    name: 'EllipticalROI',
    iconContent: `<path stroke="{{color}}" fill="none" stroke-width="3" d="M30.74 15.76C30.74 20.99 24.14 25.23 16
    25.23C7.86 25.23 1.26 20.99 1.26 15.76C1.26 10.54 7.86 6.3 16 6.3C24.14
    6.3 30.74 10.54 30.74 15.76Z" />`,
    viewBox: {
      x: 32,
      y: 32,
    },
  }),
  FreehandROI: extend(BASE, {
    name: 'FreehandROI',
    iconContent: `<g fill="{{color}}" stroke="{{color}}" stroke-width="2">
    <ellipse ry="1" rx="1" id="svg_3" cy="4.240343" cx="14.306499"/>
    <line id="svg_4" y2="3.58462" x2="12.242186" y1="3.997482" x1="13.432202"/>
    <line id="svg_5" y2="3.268901" x2="10.857882" y1="3.608906" x1="12.387902"/>
    <line id="svg_6" y2="3.147471" x2="9.740724" y1="3.293187" x1="10.955026"/>
    <line id="svg_7" y2="3.147471" x2="8.089274" y1="3.196043" x1="9.983585"/>
    <line id="svg_8" y2="3.268901" x2="6.874972" y1="3.123185" x1="8.307848"/>
    <line id="svg_9" y2="3.657478" x2="5.587812" y1="3.220329" x1="7.020688"/>
    <line id="svg_10" y2="4.046054" x2="4.737801" y1="3.560334" x1="5.854959"/>
    <line id="svg_11" y2="4.337487" x2="4.300652" y1="3.997482" x1="4.834945"/>
    <line id="svg_12" y2="4.726063" x2="3.88779" y1="4.191771" x1="4.470655"/>
    <line id="svg_15" y2="5.3575" x2="3.377783" y1="4.604633" x1="3.960648"/>
    <line id="svg_16" y2="6.183226" x2="2.916348" y1="5.138926" x1="3.547785"/>
    <line id="svg_17" y2="6.960379" x2="2.770632" y1="5.867507" x1="3.037779"/>
    <line id="svg_18" y2="7.713246" x2="2.673488" y1="6.741804" x1="2.819204"/>
    <line id="svg_19" y2="8.684687" x2="2.697774" y1="7.616102" x1="2.673488"/>
    <line id="svg_20" y2="9.753273" x2="2.892062" y1="8.611829" x1="2.697774"/>
    <line id="svg_21" y2="10.724714" x2="3.134923" y1="9.534698" x1="2.84349"/>
    <line id="svg_23" y2="11.647583" x2="3.596357" y1="10.578998" x1="3.086351"/>
    <line id="svg_25" y2="12.521881" x2="4.276366" y1="11.501867" x1="3.499213"/>
    <line id="svg_26" y2="13.930471" x2="5.830673" y1="12.376165" x1="4.13065"/>
    <line id="svg_28" y2="14.707624" x2="7.263549" y1="13.881899" x1="5.733528"/>
    <line id="svg_29" y2="15.339061" x2="8.963571" y1="14.61048" x1="7.06926"/>
    <line id="svg_30" y2="15.581921" x2="10.882168" y1="15.314775" x1="8.817855"/>
    <line id="svg_31" y2="15.460491" x2="12.023612" y1="15.581921" x1="10.785024"/>
    <line id="svg_33" y2="15.120487" x2="13.092197" y1="15.484777" x1="11.877895"/>
    <line id="svg_34" y2="14.586194" x2="13.86935" y1="15.217631" x1="12.897909"/>
    <line id="svg_35" y2="13.833327" x2="14.597931" y1="14.756196" x1="13.699348"/>
    <line id="svg_37" y2="12.716169" x2="15.180796" y1="13.881899" x1="14.549359"/>
    <line id="svg_39" y2="11.429009" x2="15.520801" y1="12.813313" x1="15.15651"/>
    <ellipse ry="1" rx="1" id="svg_40" cy="10.967574" cx="15.520801"/>
  </g>`,
    viewBox: {
      x: 18,
      y: 18,
    },
  }),
  FreehandROISculptor: extend(BASE, {
    name: 'FreehandROISculptor',
    iconContent: `<g id="icon-freehand-sculpt" fill="none" stroke-width="1.5" stroke="{{color}}" stroke-linecap="round" stroke-linejoin="round">
    <line id="svg_1" y2="2.559367" x2="10.184807" y1="4.467781" x1="8.81711"/>
    <line id="svg_4" y2="1.493836" x2="11.727442" y1="2.766112" x1="10.089386"/>
    <line id="svg_7" y2="1.080346" x2="13.047428" y1="1.748291" x1="11.345759"/>
    <line id="svg_8" y2="1.000829" x2="14.351511" y1="1.112153" x1="12.77707"/>
    <line id="svg_9" y2="1.350705" x2="15.242104" y1="0.905408" x1="13.969828"/>
    <line id="svg_10" y2="2.098167" x2="15.862339" y1="1.14396" x1="14.955842"/>
    <line id="svg_11" y2="3.195505" x2="16.41896" y1="1.939133" x1="15.766918"/>
    <line id="svg_12" y2="4.292843" x2="16.530284" y1="2.925147" x1="16.387153"/>
    <line id="svg_16" y2="5.644637" x2="16.196311" y1="3.831643" x1="16.593898"/>
    <line id="svg_18" y2="7.266789" x2="15.623787" y1="5.19934" x1="16.275829"/>
    <line id="svg_19" y2="10.813258" x2="14.526449" y1="6.726071" x1="15.766918"/>
    <line id="svg_20" y2="5.056209" x2="8.085552" y1="4.181519" x1="8.976145"/>
    <line id="svg_23" y2="5.326568" x2="7.481221" y1="4.78585" x1="8.403621"/>
    <line id="svg_24" y2="5.565119" x2="6.749662" y1="5.294761" x1="7.624352"/>
    <line id="svg_25" y2="5.994512" x2="5.429675" y1="5.533312" x1="6.956407"/>
    <line id="svg_27" y2="6.551133" x2="4.284627" y1="5.962706" x1="5.572807"/>
    <line id="svg_28" y2="7.584858" x2="3.044158" y1="6.392099" x1="4.427758"/>
    <line id="svg_29" y2="8.84123" x2="2.185372" y1="7.489437" x1="3.219096"/>
    <line id="svg_31" y2="10.606513" x2="1.644654" y1="8.602678" x1="2.280792"/>
    <line id="svg_32" y2="13.214679" x2="1.48562" y1="10.352058" x1="1.724171"/>
    <line id="svg_33" y2="14.375631" x2="1.676461" y1="12.992031" x1="1.453813"/>
    <line id="svg_34" y2="15.298031" x2="2.264889" y1="14.152983" x1="1.517427"/>
    <line id="svg_35" y2="16.172721" x2="3.521261" y1="14.948155" x1="1.915013"/>
    <line id="svg_36" y2="16.824762" x2="5.207027" y1="15.997783" x1="3.28271"/>
    <line id="svg_38" y2="17.063314" x2="7.035924" y1="16.745245" x1="4.968475"/>
    <line id="svg_39" y2="16.888376" x2="9.278311" y1="17.047411" x1="6.733758"/>
    <line id="svg_40" y2="16.284045" x2="10.661911" y1="16.983797" x1="8.992048"/>
    <line id="svg_41" y2="15.313934" x2="11.647925" y1="16.395369" x1="10.455166"/>
    <line id="svg_44" y2="13.898527" x2="12.82478" y1="15.425259" x1="11.504794"/>
    <line id="svg_45" y2="12.037824" x2="14.144766" y1="14.312017" x1="12.522614"/>
    <line id="svg_47" y2="10.59061" x2="14.605966" y1="12.228665" x1="13.953925"/>
    <ellipse ry="1" rx="1" id="svg_48" cy="3.982726" cx="13.460918"/>
  </g>`,
    viewBox: {
      x: 18,
      y: 18,
    },
  }),
  Length: extend(BASE, {
    name: 'Length',
    iconContent: `<g id="length-group" fill="none" stroke-width="1" stroke="{{color}}" stroke-linecap="round" stroke-linejoin="round">
    <path id="length-dashes" d="m22.5,6 -16.5,16.5" stroke-width="3" stroke-dasharray="0.6666,5" />
  </g>`,
    viewBox: {
      x: 24,
      y: 24,
    },
  }),
  Height: extend(BASE, {
    name: 'Height',
    iconContent: `<path d="m 6 22 l 8.5 0 v -16 h 8" stroke-width="3" fill="none" stroke="{{color}}" />`,
    viewBox: {
      x: 24,
      y: 24,
    },
  }),
  Probe: extend(BASE, {
    name: 'Probe',
    iconContent: `<path fill="{{color}}" d="M1152 896q0 106-75 181t-181 75-181-75-75-181 75-181 181-75 181 75
    75 181zm-256-544q-148 0-273 73t-198 198-73 273 73 273 198 198 273 73 273-73
    198-198 73-273-73-273-198-198-273-73zm768 544q0 209-103 385.5t-279.5
    279.5-385.5 103-385.5-103-279.5-279.5-103-385.5 103-385.5 279.5-279.5
    385.5-103 385.5 103 279.5 279.5 103 385.5z" />`,
    viewBox: {
      x: 1792,
      y: 1792,
    },
  }),
  RectangleROI: extend(BASE, {
    name: 'RectangleROI',
    iconContent: `<path fill="{{color}}" d="M1312 256h-832q-66 0-113 47t-47 113v832q0 66 47
    113t113 47h832q66 0 113-47t47-113v-832q0-66-47-113t-113-47zm288 160v832q0
    119-84.5 203.5t-203.5 84.5h-832q-119 0-203.5-84.5t-84.5-203.5v-832q0-119
    84.5-203.5t203.5-84.5h832q119 0 203.5 84.5t84.5 203.5z" />`,
    viewBox: {
      x: 1792,
      y: 1792,
    },
  }),
  Label: extend(BASE, {
    name: 'Label',
    iconContent: `<path fill="{{color}}" d="M789 559l-170 450q33 0 136.5 2t160.5 2q19 0
    57-2-87-253-184-452zm-725 1105l2-79q23-7 56-12.5t57-10.5 49.5-14.5 44.5-29
    31-50.5l237-616 280-724h128q8 14 11 21l205 480q33 78 106 257.5t114 274.5q15
    34 58 144.5t72 168.5q20 45 35 57 19 15 88 29.5t84 20.5q6 38 6 57 0 5-.5
    13.5t-.5 12.5q-63 0-190-8t-191-8q-76 0-215 7t-178 8q0-43 4-78l131-28q1 0
    12.5-2.5t15.5-3.5 14.5-4.5 15-6.5 11-8 9-11
    2.5-14q0-16-31-96.5t-72-177.5-42-100l-450-2q-26 58-76.5 195.5t-50.5 162.5q0
    22 14 37.5t43.5 24.5 48.5 13.5 57 8.5 41 4q1 19 1 58 0 9-2 27-58
    0-174.5-10t-174.5-10q-8 0-26.5 4t-21.5 4q-80 14-188 14z" />`,
    viewBox: {
      x: 1792,
      y: 1792,
    },
  }),
  Crosshairs: extend(BASE, {
    name: 'Crosshairs',
    iconContent: `<path fill="{{color}}" d="M1325 1024h-109q-26 0-45-19t-19-45v-128q0-26
    19-45t45-19h109q-32-108-112.5-188.5t-188.5-112.5v109q0 26-19 45t-45
    19h-128q-26 0-45-19t-19-45v-109q-108 32-188.5 112.5t-112.5 188.5h109q26
    0 45 19t19 45v128q0 26-19 45t-45 19h-109q32 108 112.5 188.5t188.5
    112.5v-109q0-26 19-45t45-19h128q26 0 45 19t19 45v109q108-32
    188.5-112.5t112.5-188.5zm339-192v128q0 26-19 45t-45 19h-143q-37 161-154.5
    278.5t-278.5 154.5v143q0 26-19 45t-45 19h-128q-26
    0-45-19t-19-45v-143q-161-37-278.5-154.5t-154.5-278.5h-143q-26
    0-45-19t-19-45v-128q0-26 19-45t45-19h143q37-161
    154.5-278.5t278.5-154.5v-143q0-26 19-45t45-19h128q26 0 45 19t19 45v143q161
    37 278.5 154.5t154.5 278.5h143q26 0 45 19t19 45z" />`,
    viewBox: {
      x: 1792,
      y: 1792,
    },
  }),
  Eraser: extend(BASE, {
    name: 'Eraser',
    iconContent: `<path transform="translate(0,1792) scale(1,-1)" fill="{{color}}" d="M960 1408l336-384h-768l-336 384h768zm1013-1077q15
    34 9.5 71.5t-30.5 65.5l-896 1024q-38 44-96 44h-768q-38
    0-69.5-20.5t-47.5-54.5q-15-34-9.5-71.5t30.5-65.5l896-1024q38-44 96-44h768q38
    0 69.5 20.5t47.5 54.5z" />`,
    viewBox: {
      x: 2048,
      y: 1792,
    },
  }),
  Magnify: extend(BASE, {
    name: 'Magnify',
    iconContent: `<path fill="{{color}}" d="M508.5 481.6l-129-129c-2.3-2.3-5.3-3.5-8.5-3.5h-10.3C395
    312 416 262.5 416 208 416 93.1 322.9 0 208 0S0 93.1 0 208s93.1 208 208 208c54.5
    0 104-21 141.1-55.2V371c0 3.2 1.3 6.2 3.5 8.5l129 129c4.7 4.7 12.3 4.7 17
    0l9.9-9.9c4.7-4.7 4.7-12.3 0-17zM208 384c-97.3 0-176-78.7-176-176S110.7 32 208
    32s176 78.7 176 176-78.7 176-176 176z" />`,
    viewBox: {
      x: 512,
      y: 512,
    },
  }),
  Pan: extend(BASE, {
    name: 'Pan',
    iconContent: `<path fill="{{color}}" d="M1411 541l-355 355 355 355 144-144q29-31 70-14 39 17
    39 59v448q0 26-19 45t-45 19h-448q-42 0-59-40-17-39 14-69l144-144-355-355-355
    355 144 144q31 30 14 69-17 40-59 40h-448q-26 0-45-19t-19-45v-448q0-42 40-59
    39-17 69 14l144 144 355-355-355-355-144 144q-19 19-45 19-12
    0-24-5-40-17-40-59v-448q0-26 19-45t45-19h448q42 0 59 40 17 39-14 69l-144
    144 355 355 355-355-144-144q-31-30-14-69 17-40 59-40h448q26 0 45 19t19
    45v448q0 42-39 59-13 5-25 5-26 0-45-19z" />`,
    viewBox: {
      x: 1792,
      y: 1792,
    },
  }),
  Rotate: extend(BASE, {
    name: 'Rotate',
    iconContent: `<path fill="{{color}}" d="M1664 256v448q0 26-19 45t-45 19h-448q-42 0-59-40-17-39
    14-69l138-138q-148-137-349-137-104 0-198.5 40.5t-163.5 109.5-109.5
    163.5-40.5 198.5 40.5 198.5 109.5 163.5 163.5 109.5 198.5 40.5q119 0
    225-52t179-147q7-10 23-12 15 0 25 9l137 138q9 8 9.5 20.5t-7.5 22.5q-109
    132-264 204.5t-327 72.5q-156 0-298-61t-245-164-164-245-61-298 61-298
    164-245 245-164 298-61q147 0 284.5 55.5t244.5 156.5l130-129q29-31 70-14
    39 17 39 59z" />`,
    viewBox: {
      x: 1792,
      y: 1792,
    },
  }),
  StackScroll: extend(BASE, {
    name: 'StackScroll',
    iconContent: `<path fill="{{color}}" d="M24 21v2c0 0.547-0.453 1-1 1h-22c-0.547
    0-1-0.453-1-1v-2c0-0.547 0.453-1 1-1h22c0.547 0 1 0.453 1 1zM24 13v2c0
    0.547-0.453 1-1 1h-22c-0.547 0-1-0.453-1-1v-2c0-0.547 0.453-1 1-1h22c0.547
    0 1 0.453 1 1zM24 5v2c0 0.547-0.453 1-1 1h-22c-0.547
    0-1-0.453-1-1v-2c0-0.547 0.453-1 1-1h22c0.547 0 1 0.453 1 1z" />`,
    viewBox: {
      x: 24,
      y: 28,
    },
  }),
  WindowLevelRegion: extend(BASE, {
    name: 'WindowLevelRegion',
    iconContent: `<path fill="{{color}}" d="M1664 416v960q0 119-84.5 203.5t-203.5 84.5h-960q-119
    0-203.5-84.5t-84.5-203.5v-960q0-119 84.5-203.5t203.5-84.5h960q119 0 203.5
    84.5t84.5 203.5z" />`,
    viewBox: {
      x: 1792,
      y: 1792,
    },
  }),
  WindowLevel: extend(BASE, {
    name: 'WindowLevel',
    iconContent: `
    <path fill="{{color}}" d="M14.5,3.5 a1 1 0 0 1 -11,11 Z" stroke="none" opacity="0.8" />
    <circle cx="9" cy="9" r="8" fill="none" stroke-width="2" stroke="{{color}}" />`,
    viewBox: {
      x: 18,
      y: 18,
    },
  }),
  Zoom: extend(BASE, {
    name: 'Zoom',
    iconContent: `
  <path fill="{{color}}" d="M508.5 481.6l-129-129c-2.3-2.3-5.3-3.5-8.5-3.5h-10.3C395
    312 416 262.5 416 208 416 93.1 322.9 0 208 0S0 93.1 0 208s93.1 208 208 208c54.5
    0 104-21 141.1-55.2V371c0 3.2 1.3 6.2 3.5 8.5l129 129c4.7 4.7 12.3 4.7 17
    0l9.9-9.9c4.7-4.7 4.7-12.3 0-17zM208 384c-97.3 0-176-78.7-176-176S110.7 32 208
    32s176 78.7 176 176-78.7 176-176 176z" />
  <path fill="{{color}}" transform="scale(0.22,0.22) translate(1400,0)" d="M1216
    320q0 26-19 45t-45 19h-128v1024h128q26 0 45 19t19 45-19 45l-256 256q-19
    19-45 19t-45-19l-256-256q-19-19-19-45t19-45 45-19h128v-1024h-128q-26
    0-45-19t-19-45 19-45l256-256q19-19 45-19t45 19l256 256q19 19 19 45z" />`,
    viewBox: {
      x: 640,
      y: 512,
    },
  }),

  /*
   * Segmentation Cursors
   */

  SegmentationFreeHandEraseInside: extend(BASE, {
    name: 'SegmentationFreeHandEraseInside',
    iconContent: `${SCISSOR_ICON} ${MINUS_RECT}`,
    viewBox: SEGMENTATION_CURSOR_BOUNDARIES,
  }),

  SegmentationFreeHandFillInside: extend(BASE, {
    name: 'SegmentationFreeHandFillInside',
    iconContent: `${SCISSOR_ICON} ${PLUS_RECT}`,
    viewBox: SEGMENTATION_CURSOR_BOUNDARIES,
  }),

  SegmentationFreeHandEraseOutside: extend(BASE, {
    name: 'SegmentationFreeHandEraseOutside',
    iconContent: `${SCISSOR_ICON} ${MINUS_RECT}`,
    viewBox: SEGMENTATION_CURSOR_BOUNDARIES,
  }),

  SegmentationFreeHandFillOutside: extend(BASE, {
    name: 'SegmentationFreeHandFillOutside',
    iconContent: `${SCISSOR_ICON} ${PLUS_RECT}`,
    viewBox: SEGMENTATION_CURSOR_BOUNDARIES,
  }),

  SegmentationRectangleEraseInside: extend(BASE, {
    name: 'SegmentationRectangleEraseInside',
    iconContent: `${RECTANGLE_ICON} ${MINUS_RECT}`,
    viewBox: SEGMENTATION_CURSOR_BOUNDARIES,
  }),

  // Default Rectangle Scissors
  RectangleScissor: extend(BASE, {
    name: 'RectangleScissor',
    iconContent: `${RECTANGLE_ICON} ${PLUS_RECT}`,
    viewBox: SEGMENTATION_CURSOR_BOUNDARIES,
  }),

  'RectangleScissor.FILL_INSIDE': extend(BASE, {
    name: 'RectangleScissor.FILL_INSIDE',
    iconContent: `${RECTANGLE_ICON} ${PLUS_RECT}`,
    viewBox: SEGMENTATION_CURSOR_BOUNDARIES,
  }),

  'RectangleScissor.FILL_OUTSIDE': extend(BASE, {
    name: 'RectangleScissor.FILL_OUTSIDE',
    iconContent: `${RECTANGLE_ICON} ${PLUS_RECT}`,
    viewBox: SEGMENTATION_CURSOR_BOUNDARIES,
  }),

  'RectangleScissor.ERASE_OUTSIDE': extend(BASE, {
    name: 'RectangleScissor.ERASE_OUTSIDE',
    iconContent: `${RECTANGLE_ICON} ${MINUS_RECT}`,
    viewBox: SEGMENTATION_CURSOR_BOUNDARIES,
  }),

  'RectangleScissor.ERASE_INSIDE': extend(BASE, {
    name: 'RectangleScissor.ERASE_INSIDE',
    iconContent: `${RECTANGLE_ICON} ${MINUS_RECT}`,
    viewBox: SEGMENTATION_CURSOR_BOUNDARIES,
  }),

  CircleScissor: extend(BASE, {
    name: 'CircleScissor',
    iconContent: `${CIRCLE_ICON} ${PLUS_RECT}`,
    viewBox: SEGMENTATION_CURSOR_BOUNDARIES,
  }),

  'CircleScissor.FILL_INSIDE': extend(BASE, {
    name: 'CircleScissor.FILL_INSIDE',
    iconContent: `${CIRCLE_ICON} ${PLUS_RECT}`,
    viewBox: SEGMENTATION_CURSOR_BOUNDARIES,
  }),

  'CircleScissor.ERASE_OUTSIDE': extend(BASE, {
    name: 'CircleScissor.ERASE_OUTSIDE',
    iconContent: `${CIRCLE_ICON} ${MINUS_RECT}`,
    viewBox: SEGMENTATION_CURSOR_BOUNDARIES,
  }),

  'CircleScissor.FILL_OUTSIDE': extend(BASE, {
    name: 'CircleScissor.FILL_OUTSIDE',
    iconContent: `${CIRCLE_ICON} ${PLUS_RECT}`,
    viewBox: SEGMENTATION_CURSOR_BOUNDARIES,
  }),
};

/*
 * Utils
 */

function extend(
  base: SVGCursorDescriptor,
  values: Record<string, unknown> & { name?: string }
): SVGCursorDescriptor {
  return Object.assign(Object.create(base), {
    ...values,
    name: values.name || base.name,
  });
}

/**
 * Registers a cursor to the list, so that it will be used for the given `toolName`.
 * Overwrites the given cursor if it is already set.
 *
 * @param toolName - The name of the tool to assign a cursor to.
 * @param iconContent - The SVG icon content of the cursor.
 * @param viewBox - The viewBox of the cursor object.
 */
function registerCursor(
  toolName: string,
  iconContent: string,
  viewBox: { x: number; y: number }
) {
  CursorSVG[toolName] = extend(BASE, {
    iconContent,
    viewBox,
  });
}

function getDefinedSVGCursorDescriptor(
  name: string
): SVGCursorDescriptor | undefined {
  return CursorSVG[name];
}

/*
 * Exports
 */
const svgCursorNames = Object.keys(CursorSVG);

export {
  getDefinedSVGCursorDescriptor,
  registerCursor,
  svgCursorNames,
  CursorSVG,
};
