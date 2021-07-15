import IPoint from '@ulixee/hero-interfaces/IPoint';

// Legendre-Gauss abscissae with n=24 (x_i values, defined at i=n as the roots of the nth order Legendre polynomial Pn(x))
const Tvalues = [
  -0.0640568928626056260850430826247450385909,
  0.0640568928626056260850430826247450385909,
  -0.1911188674736163091586398207570696318404,
  0.1911188674736163091586398207570696318404,
  -0.3150426796961633743867932913198102407864,
  0.3150426796961633743867932913198102407864,
  -0.4337935076260451384870842319133497124524,
  0.4337935076260451384870842319133497124524,
  -0.5454214713888395356583756172183723700107,
  0.5454214713888395356583756172183723700107,
  -0.6480936519369755692524957869107476266696,
  0.6480936519369755692524957869107476266696,
  -0.7401241915785543642438281030999784255232,
  0.7401241915785543642438281030999784255232,
  -0.8200019859739029219539498726697452080761,
  0.8200019859739029219539498726697452080761,
  -0.8864155270044010342131543419821967550873,
  0.8864155270044010342131543419821967550873,
  -0.9382745520027327585236490017087214496548,
  0.9382745520027327585236490017087214496548,
  -0.9747285559713094981983919930081690617411,
  0.9747285559713094981983919930081690617411,
  -0.9951872199970213601799974097007368118745,
  0.9951872199970213601799974097007368118745,
];

// Legendre-Gauss weights with n=24 (w_i values, defined by a function linked to in the Bezier primer article)
const Cvalues = [
  0.1279381953467521569740561652246953718517,
  0.1279381953467521569740561652246953718517,
  0.1258374563468282961213753825111836887264,
  0.1258374563468282961213753825111836887264,
  0.121670472927803391204463153476262425607,
  0.121670472927803391204463153476262425607,
  0.1155056680537256013533444839067835598622,
  0.1155056680537256013533444839067835598622,
  0.1074442701159656347825773424466062227946,
  0.1074442701159656347825773424466062227946,
  0.0976186521041138882698806644642471544279,
  0.0976186521041138882698806644642471544279,
  0.086190161531953275917185202983742667185,
  0.086190161531953275917185202983742667185,
  0.0733464814110803057340336152531165181193,
  0.0733464814110803057340336152531165181193,
  0.0592985849154367807463677585001085845412,
  0.0592985849154367807463677585001085845412,
  0.0442774388174198061686027482113382288593,
  0.0442774388174198061686027482113382288593,
  0.0285313886289336631813078159518782864491,
  0.0285313886289336631813078159518782864491,
  0.0123412297999871995468056670700372915759,
  0.0123412297999871995468056670700372915759,
];

export default function curveLength(derivativePoint: (t: number) => IPoint) {
  const z = 0.5;

  let sum = 0;
  for (let i = 0; i < Tvalues.length; i += 1) {
    const t = z * Tvalues[i] + z;
    const { x, y } = derivativePoint(t);
    const arc = Math.sqrt(x * x + y * y);

    sum += Cvalues[i] * arc;
  }
  return z * sum;
}
