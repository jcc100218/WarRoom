// ══════════════════════════════════════════════════════════════════
// js/mock-draft.js — War Room Mock Draft Simulator
// Pick-by-pick draft sim with AI opponents. No JSX.
// Exposed as window.MockDraftSimulator
// ══════════════════════════════════════════════════════════════════

(function () {
    var e = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useMemo = React.useMemo;

    // ── Static fallback pool (top 200 dynasty players) ────────────
    var STATIC_POOL = [
        // QBs
        {pid:'s001',name:'Patrick Mahomes',pos:'QB',team:'KC',age:29,dynastyValue:9400,rank:1},
        {pid:'s002',name:'Josh Allen',pos:'QB',team:'BUF',age:28,dynastyValue:9000,rank:2},
        {pid:'s003',name:'Lamar Jackson',pos:'QB',team:'BAL',age:27,dynastyValue:8800,rank:3},
        {pid:'s004',name:'Joe Burrow',pos:'QB',team:'CIN',age:28,dynastyValue:8400,rank:4},
        {pid:'s005',name:'C.J. Stroud',pos:'QB',team:'HOU',age:23,dynastyValue:8200,rank:5},
        {pid:'s006',name:'Anthony Richardson',pos:'QB',team:'IND',age:22,dynastyValue:7800,rank:6},
        {pid:'s007',name:'Caleb Williams',pos:'QB',team:'CHI',age:23,dynastyValue:7600,rank:7},
        {pid:'s008',name:'Jayden Daniels',pos:'QB',team:'WSH',age:24,dynastyValue:7400,rank:8},
        {pid:'s009',name:'Drake Maye',pos:'QB',team:'NE',age:22,dynastyValue:7200,rank:9},
        {pid:'s010',name:'Jordan Love',pos:'QB',team:'GB',age:26,dynastyValue:7000,rank:10},
        {pid:'s011',name:'Trevor Lawrence',pos:'QB',team:'JAX',age:25,dynastyValue:6800,rank:11},
        {pid:'s012',name:'Tua Tagovailoa',pos:'QB',team:'MIA',age:27,dynastyValue:6400,rank:12},
        {pid:'s013',name:'Bryce Young',pos:'QB',team:'CAR',age:23,dynastyValue:6200,rank:13},
        {pid:'s014',name:'Michael Penix Jr.',pos:'QB',team:'ATL',age:25,dynastyValue:6000,rank:14},
        {pid:'s015',name:'Bo Nix',pos:'QB',team:'DEN',age:25,dynastyValue:5800,rank:15},
        {pid:'s016',name:'Arch Manning',pos:'QB',team:'NO',age:22,dynastyValue:7000,rank:16},
        {pid:'s017',name:'Justin Fields',pos:'QB',team:'PIT',age:26,dynastyValue:5200,rank:17},
        {pid:'s018',name:'Kyler Murray',pos:'QB',team:'ARI',age:27,dynastyValue:5800,rank:18},
        {pid:'s019',name:'Dak Prescott',pos:'QB',team:'DAL',age:31,dynastyValue:5500,rank:19},
        {pid:'s020',name:'Will Levis',pos:'QB',team:'TEN',age:25,dynastyValue:5000,rank:20},
        // RBs
        {pid:'s021',name:'Bijan Robinson',pos:'RB',team:'ATL',age:22,dynastyValue:9200,rank:21},
        {pid:'s022',name:'Jahmyr Gibbs',pos:'RB',team:'DET',age:22,dynastyValue:8900,rank:22},
        {pid:'s023',name:"De'Von Achane",pos:'RB',team:'MIA',age:23,dynastyValue:8700,rank:23},
        {pid:'s024',name:'Christian McCaffrey',pos:'RB',team:'SF',age:28,dynastyValue:8500,rank:24},
        {pid:'s025',name:'Breece Hall',pos:'RB',team:'NYJ',age:24,dynastyValue:8200,rank:25},
        {pid:'s026',name:'Saquon Barkley',pos:'RB',team:'PHI',age:28,dynastyValue:7800,rank:26},
        {pid:'s027',name:'Chase Brown',pos:'RB',team:'CIN',age:24,dynastyValue:7800,rank:27},
        {pid:'s028',name:'Kyren Williams',pos:'RB',team:'LAR',age:25,dynastyValue:7600,rank:28},
        {pid:'s029',name:'Derrick Henry',pos:'RB',team:'BAL',age:31,dynastyValue:7500,rank:29},
        {pid:'s030',name:'Travis Etienne Jr.',pos:'RB',team:'JAX',age:26,dynastyValue:7400,rank:30},
        {pid:'s031',name:'James Cook',pos:'RB',team:'BUF',age:24,dynastyValue:7400,rank:31},
        {pid:'s032',name:"D'Andre Swift",pos:'RB',team:'CHI',age:26,dynastyValue:7200,rank:32},
        {pid:'s033',name:'Jonathan Taylor',pos:'RB',team:'IND',age:26,dynastyValue:7200,rank:33},
        {pid:'s034',name:'Tank Bigsby',pos:'RB',team:'JAX',age:23,dynastyValue:7200,rank:34},
        {pid:'s035',name:'Isiah Pacheco',pos:'RB',team:'KC',age:25,dynastyValue:6800,rank:35},
        {pid:'s036',name:'Jonathon Brooks',pos:'RB',team:'CAR',age:22,dynastyValue:6900,rank:36},
        {pid:'s037',name:'Blake Corum',pos:'RB',team:'LAR',age:23,dynastyValue:6800,rank:37},
        {pid:'s038',name:'Tyrone Tracy Jr.',pos:'RB',team:'NYG',age:23,dynastyValue:6500,rank:38},
        {pid:'s039',name:'Javonte Williams',pos:'RB',team:'DEN',age:24,dynastyValue:6600,rank:39},
        {pid:'s040',name:'Rhamondre Stevenson',pos:'RB',team:'NE',age:26,dynastyValue:6400,rank:40},
        {pid:'s041',name:'Josh Jacobs',pos:'RB',team:'GB',age:27,dynastyValue:6000,rank:41},
        {pid:'s042',name:'Rachaad White',pos:'RB',team:'TB',age:26,dynastyValue:6200,rank:42},
        {pid:'s043',name:'Trey Benson',pos:'RB',team:'ARI',age:23,dynastyValue:6000,rank:43},
        {pid:'s044',name:'Braelon Allen',pos:'RB',team:'NYJ',age:21,dynastyValue:7000,rank:44},
        {pid:'s045',name:'Rico Dowdle',pos:'RB',team:'DAL',age:27,dynastyValue:6800,rank:45},
        {pid:'s046',name:'J.K. Dobbins',pos:'RB',team:'LAC',age:26,dynastyValue:5800,rank:46},
        {pid:'s047',name:'Zach Charbonnet',pos:'RB',team:'SEA',age:24,dynastyValue:6200,rank:47},
        {pid:'s048',name:'Tony Pollard',pos:'RB',team:'TEN',age:28,dynastyValue:5500,rank:48},
        {pid:'s049',name:'Alvin Kamara',pos:'RB',team:'NO',age:30,dynastyValue:5500,rank:49},
        {pid:'s050',name:'Keaton Mitchell',pos:'RB',team:'BAL',age:23,dynastyValue:5800,rank:50},
        {pid:'s051',name:'Zamir White',pos:'RB',team:'LV',age:25,dynastyValue:5500,rank:51},
        {pid:'s052',name:'Khalil Herbert',pos:'RB',team:'CHI',age:26,dynastyValue:5000,rank:52},
        {pid:'s053',name:'David Montgomery',pos:'RB',team:'DET',age:28,dynastyValue:6500,rank:53},
        {pid:'s054',name:'Audric Estime',pos:'RB',team:'DEN',age:22,dynastyValue:5800,rank:54},
        {pid:'s055',name:'MarShawn Lloyd',pos:'RB',team:'LAR',age:22,dynastyValue:6200,rank:55},
        {pid:'s056',name:'Will Shipley',pos:'RB',team:'PHI',age:22,dynastyValue:5500,rank:56},
        {pid:'s057',name:'Jerome Ford',pos:'RB',team:'CLE',age:25,dynastyValue:5200,rank:57},
        {pid:'s058',name:'Eric Gray',pos:'RB',team:'NYG',age:24,dynastyValue:5200,rank:58},
        // WRs
        {pid:'s059',name:"Ja'Marr Chase",pos:'WR',team:'CIN',age:25,dynastyValue:9800,rank:59},
        {pid:'s060',name:'CeeDee Lamb',pos:'WR',team:'DAL',age:26,dynastyValue:9600,rank:60},
        {pid:'s061',name:'Justin Jefferson',pos:'WR',team:'MIN',age:26,dynastyValue:9200,rank:61},
        {pid:'s062',name:'Amon-Ra St. Brown',pos:'WR',team:'DET',age:25,dynastyValue:8800,rank:62},
        {pid:'s063',name:'A.J. Brown',pos:'WR',team:'PHI',age:27,dynastyValue:8400,rank:63},
        {pid:'s064',name:'Malik Nabers',pos:'WR',team:'NYG',age:22,dynastyValue:8500,rank:64},
        {pid:'s065',name:'Brian Thomas Jr.',pos:'WR',team:'JAX',age:23,dynastyValue:8200,rank:65},
        {pid:'s066',name:'Jaylen Waddle',pos:'WR',team:'MIA',age:26,dynastyValue:8000,rank:66},
        {pid:'s067',name:'Marvin Harrison Jr.',pos:'WR',team:'ARI',age:22,dynastyValue:8000,rank:67},
        {pid:'s068',name:'Zay Flowers',pos:'WR',team:'BAL',age:24,dynastyValue:8000,rank:68},
        {pid:'s069',name:'Tyreek Hill',pos:'WR',team:'MIA',age:31,dynastyValue:7800,rank:69},
        {pid:'s070',name:'Puka Nacua',pos:'WR',team:'LAR',age:24,dynastyValue:7800,rank:70},
        {pid:'s071',name:'George Pickens',pos:'WR',team:'PIT',age:23,dynastyValue:7600,rank:71},
        {pid:'s072',name:'Rome Odunze',pos:'WR',team:'CHI',age:22,dynastyValue:7600,rank:72},
        {pid:'s073',name:'Drake London',pos:'WR',team:'ATL',age:24,dynastyValue:7600,rank:73},
        {pid:'s074',name:'Chris Olave',pos:'WR',team:'NO',age:25,dynastyValue:7800,rank:74},
        {pid:'s075',name:'DK Metcalf',pos:'WR',team:'SEA',age:27,dynastyValue:7400,rank:75},
        {pid:'s076',name:'Rashee Rice',pos:'WR',team:'KC',age:24,dynastyValue:7500,rank:76},
        {pid:'s077',name:'Ladd McConkey',pos:'WR',team:'LAC',age:23,dynastyValue:7400,rank:77},
        {pid:'s078',name:'Jordan Addison',pos:'WR',team:'MIN',age:23,dynastyValue:7400,rank:78},
        {pid:'s079',name:'Jaxon Smith-Njigba',pos:'WR',team:'SEA',age:23,dynastyValue:7200,rank:79},
        {pid:'s080',name:'Michael Pittman Jr.',pos:'WR',team:'IND',age:27,dynastyValue:7200,rank:80},
        {pid:'s081',name:'Keon Coleman',pos:'WR',team:'BUF',age:22,dynastyValue:6800,rank:81},
        {pid:'s082',name:'Tank Dell',pos:'WR',team:'HOU',age:25,dynastyValue:6800,rank:82},
        {pid:'s083',name:'Xavier Worthy',pos:'WR',team:'KC',age:22,dynastyValue:7000,rank:83},
        {pid:'s084',name:'Adonai Mitchell',pos:'WR',team:'IND',age:22,dynastyValue:6600,rank:84},
        {pid:'s085',name:'Deebo Samuel',pos:'WR',team:'SF',age:29,dynastyValue:6800,rank:85},
        {pid:'s086',name:'Tee Higgins',pos:'WR',team:'CIN',age:26,dynastyValue:7200,rank:86},
        {pid:'s087',name:'Mike Evans',pos:'WR',team:'TB',age:31,dynastyValue:6800,rank:87},
        {pid:'s088',name:'Terry McLaurin',pos:'WR',team:'WSH',age:30,dynastyValue:6200,rank:88},
        {pid:'s089',name:'Ricky Pearsall',pos:'WR',team:'SF',age:23,dynastyValue:6200,rank:89},
        {pid:'s090',name:"Wan'Dale Robinson",pos:'WR',team:'NYG',age:24,dynastyValue:6400,rank:90},
        {pid:'s091',name:'Khalil Shakir',pos:'WR',team:'BUF',age:25,dynastyValue:6400,rank:91},
        {pid:'s092',name:'Courtland Sutton',pos:'WR',team:'DEN',age:29,dynastyValue:5800,rank:92},
        {pid:'s093',name:'Jerry Jeudy',pos:'WR',team:'CLE',age:26,dynastyValue:6200,rank:93},
        {pid:'s094',name:'Dontayvion Wicks',pos:'WR',team:'GB',age:23,dynastyValue:5800,rank:94},
        {pid:'s095',name:'Devaughn Vele',pos:'WR',team:'DEN',age:24,dynastyValue:5800,rank:95},
        {pid:'s096',name:'Romeo Doubs',pos:'WR',team:'GB',age:24,dynastyValue:5500,rank:96},
        {pid:'s097',name:'Jalen McMillan',pos:'WR',team:'TB',age:23,dynastyValue:5500,rank:97},
        {pid:'s098',name:'Quentin Johnston',pos:'WR',team:'LAC',age:23,dynastyValue:6000,rank:98},
        {pid:'s099',name:'Parker Washington',pos:'WR',team:'JAX',age:23,dynastyValue:6200,rank:99},
        {pid:'s100',name:'Troy Franklin',pos:'WR',team:'DEN',age:22,dynastyValue:6000,rank:100},
        {pid:'s101',name:'Cedric Tillman',pos:'WR',team:'CLE',age:24,dynastyValue:5500,rank:101},
        {pid:'s102',name:'Kayshon Boutte',pos:'WR',team:'NE',age:23,dynastyValue:5200,rank:102},
        {pid:'s103',name:'Elijah Moore',pos:'WR',team:'CLE',age:24,dynastyValue:5500,rank:103},
        {pid:'s104',name:'Demario Douglas',pos:'WR',team:'NE',age:24,dynastyValue:5800,rank:104},
        {pid:'s105',name:'Rashid Shaheed',pos:'WR',team:'NO',age:25,dynastyValue:5600,rank:105},
        {pid:'s106',name:'Calvin Ridley',pos:'WR',team:'TEN',age:30,dynastyValue:5500,rank:106},
        {pid:'s107',name:'Bryce Ford-Wheaton',pos:'WR',team:'NYG',age:23,dynastyValue:4800,rank:107},
        {pid:'s108',name:'Joshua Palmer',pos:'WR',team:'LAC',age:25,dynastyValue:5800,rank:108},
        {pid:'s109',name:'Tre Tucker',pos:'WR',team:'LV',age:24,dynastyValue:5200,rank:109},
        {pid:'s110',name:'Davante Adams',pos:'WR',team:'LV',age:32,dynastyValue:6500,rank:110},
        // TEs
        {pid:'s111',name:'Brock Bowers',pos:'TE',team:'LV',age:22,dynastyValue:8800,rank:111},
        {pid:'s112',name:'Travis Kelce',pos:'TE',team:'KC',age:35,dynastyValue:8500,rank:112},
        {pid:'s113',name:'Mark Andrews',pos:'TE',team:'BAL',age:29,dynastyValue:8000,rank:113},
        {pid:'s114',name:'Sam LaPorta',pos:'TE',team:'DET',age:24,dynastyValue:7800,rank:114},
        {pid:'s115',name:'Kyle Pitts',pos:'TE',team:'ATL',age:25,dynastyValue:7500,rank:115},
        {pid:'s116',name:'Trey McBride',pos:'TE',team:'ARI',age:25,dynastyValue:7200,rank:116},
        {pid:'s117',name:'Cole Kmet',pos:'TE',team:'CHI',age:26,dynastyValue:6800,rank:117},
        {pid:'s118',name:'Tucker Kraft',pos:'TE',team:'GB',age:24,dynastyValue:6400,rank:118},
        {pid:'s119',name:'Isaiah Likely',pos:'TE',team:'BAL',age:25,dynastyValue:6200,rank:119},
        {pid:'s120',name:'Jake Ferguson',pos:'TE',team:'DAL',age:25,dynastyValue:6000,rank:120},
        {pid:'s121',name:'Dalton Kincaid',pos:'TE',team:'BUF',age:25,dynastyValue:6500,rank:121},
        {pid:'s122',name:'Michael Mayer',pos:'TE',team:'LV',age:23,dynastyValue:6200,rank:122},
        {pid:'s123',name:'Theo Johnson',pos:'TE',team:'NYG',age:23,dynastyValue:5800,rank:123},
        {pid:'s124',name:'Cade Otton',pos:'TE',team:'TB',age:25,dynastyValue:6000,rank:124},
        {pid:'s125',name:'Pat Freiermuth',pos:'TE',team:'PIT',age:26,dynastyValue:5500,rank:125},
        {pid:'s126',name:"Ja'Tavion Sanders",pos:'TE',team:'CIN',age:22,dynastyValue:5500,rank:126},
        {pid:'s127',name:'Chigoziem Okonkwo',pos:'TE',team:'TEN',age:25,dynastyValue:5800,rank:127},
        {pid:'s128',name:'Greg Dulcich',pos:'TE',team:'DEN',age:25,dynastyValue:5800,rank:128},
        {pid:'s129',name:'Dawson Knox',pos:'TE',team:'BUF',age:28,dynastyValue:5500,rank:129},
        {pid:'s130',name:'Tyler Higbee',pos:'TE',team:'LAR',age:31,dynastyValue:5200,rank:130},
        {pid:'s131',name:'Hunter Henry',pos:'TE',team:'NE',age:30,dynastyValue:4800,rank:131},
        {pid:'s132',name:'Kylen Granson',pos:'TE',team:'IND',age:28,dynastyValue:4200,rank:132},
        {pid:'s133',name:'Noah Fant',pos:'TE',team:'SEA',age:27,dynastyValue:5000,rank:133},
        {pid:'s134',name:'Brenton Strange',pos:'TE',team:'JAX',age:24,dynastyValue:5200,rank:134},
        // Additional RBs & WRs to fill out pool
        {pid:'s135',name:'Nick Chubb',pos:'RB',team:'CLE',age:29,dynastyValue:4800,rank:135},
        {pid:'s136',name:'Aaron Jones',pos:'RB',team:'MIN',age:30,dynastyValue:5000,rank:136},
        {pid:'s137',name:'Tony Jones Jr.',pos:'RB',team:'NO',age:27,dynastyValue:3800,rank:137},
        {pid:'s138',name:'Chuba Hubbard',pos:'RB',team:'CAR',age:25,dynastyValue:5200,rank:138},
        {pid:'s139',name:'Elijah Mitchell',pos:'RB',team:'SF',age:27,dynastyValue:4500,rank:139},
        {pid:'s140',name:'Jaleel McLaughlin',pos:'RB',team:'DEN',age:24,dynastyValue:5000,rank:140},
        {pid:'s141',name:'Pierre Strong Jr.',pos:'RB',team:'CLE',age:25,dynastyValue:4200,rank:141},
        {pid:'s142',name:'Gus Edwards',pos:'RB',team:'LAC',age:29,dynastyValue:4500,rank:142},
        {pid:'s143',name:'Devin Singletary',pos:'RB',team:'HOU',age:27,dynastyValue:4800,rank:143},
        {pid:'s144',name:'Kenneth Gainwell',pos:'RB',team:'PHI',age:25,dynastyValue:4800,rank:144},
        {pid:'s145',name:'Samaje Perine',pos:'RB',team:'DEN',age:29,dynastyValue:3500,rank:145},
        {pid:'s146',name:'Hassan Haskins',pos:'RB',team:'TEN',age:26,dynastyValue:3800,rank:146},
        {pid:'s147',name:'Kendre Miller',pos:'RB',team:'NO',age:23,dynastyValue:5500,rank:147},
        {pid:'s148',name:'Israel Abanikanda',pos:'RB',team:'NYJ',age:23,dynastyValue:4800,rank:148},
        {pid:'s149',name:'Evan Hull',pos:'RB',team:'IND',age:24,dynastyValue:4500,rank:149},
        {pid:'s150',name:'Roschon Johnson',pos:'RB',team:'CHI',age:23,dynastyValue:4800,rank:150},
        {pid:'s151',name:'Ty Chandler',pos:'RB',team:'MIN',age:25,dynastyValue:4200,rank:151},
        {pid:'s152',name:'Dontae Spencer',pos:'WR',team:'DEN',age:23,dynastyValue:4500,rank:152},
        {pid:'s153',name:'Mecole Hardman',pos:'WR',team:'KC',age:27,dynastyValue:5000,rank:153},
        {pid:'s154',name:'Darius Slayton',pos:'WR',team:'NYG',age:28,dynastyValue:4800,rank:154},
        {pid:'s155',name:'Christian Kirk',pos:'WR',team:'JAX',age:28,dynastyValue:5500,rank:155},
        {pid:'s156',name:'Tutu Atwell',pos:'WR',team:'LAR',age:25,dynastyValue:5200,rank:156},
        {pid:'s157',name:'Donovan Peoples-Jones',pos:'WR',team:'DET',age:25,dynastyValue:5000,rank:157},
        {pid:'s158',name:'Allen Lazard',pos:'WR',team:'NYJ',age:29,dynastyValue:3500,rank:158},
        {pid:'s159',name:'DeAndre Hopkins',pos:'WR',team:'TEN',age:32,dynastyValue:5200,rank:159},
        {pid:'s160',name:'Mike Williams',pos:'WR',team:'NYJ',age:30,dynastyValue:5000,rank:160},
        {pid:'s161',name:'Charlie Jones',pos:'WR',team:'CIN',age:26,dynastyValue:5000,rank:161},
        {pid:'s162',name:'Javon Baker',pos:'WR',team:'NE',age:23,dynastyValue:5200,rank:162},
        {pid:'s163',name:'Curtis Samuel',pos:'WR',team:'BUF',age:29,dynastyValue:5000,rank:163},
        {pid:'s164',name:'Marquez Valdes-Scantling',pos:'WR',team:'KC',age:30,dynastyValue:4000,rank:164},
        {pid:'s165',name:'Josh Reynolds',pos:'WR',team:'DEN',age:29,dynastyValue:4200,rank:165},
        {pid:'s166',name:'Michael Wilson',pos:'WR',team:'ARI',age:24,dynastyValue:5200,rank:166},
        {pid:'s167',name:'Zay Jones',pos:'WR',team:'ARI',age:29,dynastyValue:4200,rank:167},
        {pid:'s168',name:'Adam Thielen',pos:'WR',team:'CAR',age:35,dynastyValue:2500,rank:168},
        {pid:'s169',name:'Stefon Diggs',pos:'WR',team:'BUF',age:31,dynastyValue:6200,rank:169},
        {pid:'s170',name:'Cooper Kupp',pos:'WR',team:'LAR',age:32,dynastyValue:5500,rank:170},
        {pid:'s171',name:'Nico Collins',pos:'WR',team:'HOU',age:25,dynastyValue:7400,rank:171},
        {pid:'s172',name:'Josh Downs',pos:'WR',team:'IND',age:23,dynastyValue:6500,rank:172},
        {pid:'s173',name:'Nathaniel Dell',pos:'WR',team:'HOU',age:24,dynastyValue:6200,rank:173},
        {pid:'s174',name:'Rome Odunze II',pos:'WR',team:'CHI',age:22,dynastyValue:7400,rank:174},
        {pid:'s175',name:'Keenan Allen',pos:'WR',team:'CHI',age:32,dynastyValue:4500,rank:175},
        {pid:'s176',name:'Elijah Higgins',pos:'TE',team:'ARI',age:24,dynastyValue:5200,rank:176},
        {pid:'s177',name:'Juwan Johnson',pos:'TE',team:'NO',age:28,dynastyValue:4500,rank:177},
        {pid:'s178',name:'C.J. Uzomah',pos:'TE',team:'CHI',age:32,dynastyValue:3200,rank:178},
        {pid:'s179',name:'Tyler Conklin',pos:'TE',team:'NYJ',age:31,dynastyValue:4000,rank:179},
        {pid:'s180',name:'Durham Smythe',pos:'TE',team:'MIA',age:30,dynastyValue:3500,rank:180},
        {pid:'s181',name:'Jack Stoll',pos:'TE',team:'PHI',age:26,dynastyValue:4500,rank:181},
        {pid:'s182',name:'Zach Ertz',pos:'TE',team:'WSH',age:34,dynastyValue:3500,rank:182},
        {pid:'s183',name:'Gerald Everett',pos:'TE',team:'LAC',age:31,dynastyValue:4200,rank:183},
        {pid:'s184',name:'Will Dissly',pos:'TE',team:'SF',age:29,dynastyValue:4000,rank:184},
        {pid:'s185',name:'Adam Trautman',pos:'TE',team:'DEN',age:27,dynastyValue:3800,rank:185},
        {pid:'s186',name:'Tanner McLachlan',pos:'TE',team:'ARI',age:24,dynastyValue:4800,rank:186},
        {pid:'s187',name:'Dalton Schultz',pos:'TE',team:'HOU',age:29,dynastyValue:5500,rank:187},
        {pid:'s188',name:'Logan Thomas',pos:'TE',team:'WSH',age:35,dynastyValue:2500,rank:188},
        {pid:'s189',name:'Marcedes Lewis',pos:'TE',team:'GB',age:39,dynastyValue:1500,rank:189},
        {pid:'s190',name:'Cameron Latu',pos:'TE',team:'SF',age:24,dynastyValue:4500,rank:190},
        {pid:'s191',name:'Luke Musgrave',pos:'TE',team:'GB',age:24,dynastyValue:6200,rank:191},
        {pid:'s192',name:'Cade Stover',pos:'TE',team:'HOU',age:25,dynastyValue:5000,rank:192},
        {pid:'s193',name:'Stone Smartt',pos:'TE',team:'LAC',age:25,dynastyValue:4200,rank:193},
        {pid:'s194',name:'Devin Culp',pos:'TE',team:'SEA',age:26,dynastyValue:3800,rank:194},
        {pid:'s195',name:'John Samuel Shenker',pos:'TE',team:'ATL',age:26,dynastyValue:3500,rank:195},
        {pid:'s196',name:'Jody Fortson',pos:'TE',team:'KC',age:28,dynastyValue:3800,rank:196},
        {pid:'s197',name:'Ko Kieft',pos:'TE',team:'TB',age:27,dynastyValue:3200,rank:197},
        {pid:'s198',name:'Scotty Miller',pos:'WR',team:'TB',age:28,dynastyValue:3200,rank:198},
        {pid:'s199',name:'Kadarius Toney',pos:'WR',team:'KC',age:26,dynastyValue:3500,rank:199},
        {pid:'s200',name:'Velus Jones Jr.',pos:'WR',team:'CHI',age:26,dynastyValue:3200,rank:200},
    ];

    // ── Helpers ───────────────────────────────────────────────────
    function posColor(pos) {
        var c = (window.App && window.App.POS_COLORS) || {};
        return c[pos] || (pos === 'QB' ? '#E74C3C' : pos === 'RB' ? '#3498DB' : pos === 'WR' ? '#2ECC71' : pos === 'TE' ? '#D4AF37' : '#888');
    }

    function buildPool(playersData) {
        var scores = (window.App && window.App.LI && window.App.LI.playerScores) || {};
        var src = (window.S && window.S.players && Object.keys(window.S.players).length > 50)
            ? window.S.players
            : (playersData && Object.keys(playersData || {}).length > 50 ? playersData : null);

        if (src) {
            var normPos = (window.App && window.App.normPos) || function(p) { return (p || '').toUpperCase(); };
            var players = [];
            Object.entries(src).forEach(function(entry) {
                var pid = entry[0], p = entry[1];
                if (!p || !p.position) return;
                var pos = normPos(p.position).toUpperCase();
                if (['QB','RB','WR','TE'].indexOf(pos) < 0) return;
                var name = p.full_name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim();
                if (!name || /Duplicate|Invalid|DUP/i.test(name)) return;
                var dhq = scores[pid] || 0;
                if (dhq <= 0 && !p.team) return;
                players.push({ pid: pid, name: name, pos: pos, team: p.team || '', age: p.age || 25, dynastyValue: dhq });
            });
            players.sort(function(a, b) { return b.dynastyValue - a.dynastyValue; });
            players = players.slice(0, 300).map(function(p, i) { return Object.assign({}, p, { rank: i + 1 }); });
            if (players.length >= 50) return players;
        }
        return STATIC_POOL.slice();
    }

    function buildDraftOrder(leagueSize, rounds, format) {
        var order = [];
        for (var r = 1; r <= rounds; r++) {
            for (var i = 0; i < leagueSize; i++) {
                var teamIndex = (format === 'snake' && r % 2 === 0) ? (leagueSize - i) : (i + 1);
                order.push({ round: r, pick: i + 1, overall: (r - 1) * leagueSize + i + 1, teamIndex: teamIndex });
            }
        }
        return order;
    }

    function calcGrade(myPicksList) {
        if (!myPicksList.length) return { grade: 'C', color: '#E74C3C' };
        var avgRank = myPicksList.reduce(function(s, p) { return s + p.player.rank; }, 0) / myPicksList.length;
        var avgOverall = myPicksList.reduce(function(s, p) { return s + p.overall; }, 0) / myPicksList.length;
        var ratio = avgRank / avgOverall;
        if (ratio <= 0.55) return { grade: 'A+', color: '#2ECC71' };
        if (ratio <= 0.72) return { grade: 'A',  color: '#2ECC71' };
        if (ratio <= 0.88) return { grade: 'B+', color: '#D4AF37' };
        if (ratio <= 1.05) return { grade: 'B',  color: '#D4AF37' };
        if (ratio <= 1.25) return { grade: 'C+', color: '#E67E22' };
        return { grade: 'C', color: '#E74C3C' };
    }

    // ── Component ─────────────────────────────────────────────────
    function MockDraftSimulator(props) {
        var playersData = props.playersData;
        var draftRounds = props.draftRounds;

        var phaseState   = useState('setup');
        var phase        = phaseState[0], setPhase = phaseState[1];

        var roundsState  = useState(Math.min(parseInt(draftRounds) || 3, 5));
        var rounds       = roundsState[0], setRounds = roundsState[1];

        var posState     = useState(1);
        var draftPos     = posState[0], setDraftPos = posState[1];

        var fmtState     = useState('snake');
        var format       = fmtState[0], setFormat = fmtState[1];

        var szState      = useState(12);
        var leagueSize   = szState[0], setLeagueSize = szState[1];

        var dsState      = useState(null);
        var draftState   = dsState[0], setDraftState = dsState[1];

        // Derived from draftState
        var currentIdx   = draftState ? draftState.currentIdx : 0;
        var currentSlot  = draftState ? draftState.order[currentIdx] : null;
        var userTeamIdx  = draftState ? draftState.userTeamIndex : parseInt(draftPos);
        var isUserTurn   = currentSlot && currentSlot.teamIndex === userTeamIdx;
        var isDone       = draftState && currentIdx >= draftState.order.length;

        // AI auto-pick effect — fires when currentIdx changes
        useEffect(function() {
            if (phase !== 'drafting' || !draftState) return;
            if (isDone) { setPhase('complete'); return; }
            if (isUserTurn) return;

            var timer = setTimeout(function() {
                setDraftState(function(prev) {
                    if (!prev || prev.currentIdx !== currentIdx) return prev;
                    var slot = prev.order[prev.currentIdx];
                    var roster = prev.teamRosters[slot.teamIndex] || [];
                    var bestPlayer = null, bestScore = -1;
                    prev.available.forEach(function(p) {
                        var base = p.dynastyValue > 0 ? p.dynastyValue : Math.max(0, 5000 - p.rank * 50);
                        var posCount = roster.filter(function(r) { return r.pos === p.pos; }).length;
                        var nb = posCount === 0 ? 2000 : posCount === 1 ? 1000 : 0;
                        var s = base + nb + Math.random() * 300;
                        if (s > bestScore) { bestScore = s; bestPlayer = p; }
                    });
                    if (!bestPlayer) return prev;
                    var newAvail = prev.available.filter(function(p) { return p.pid !== bestPlayer.pid; });
                    var newRosters = Object.assign({}, prev.teamRosters);
                    newRosters[slot.teamIndex] = (newRosters[slot.teamIndex] || []).concat([bestPlayer]);
                    return Object.assign({}, prev, {
                        available: newAvail,
                        picks: prev.picks.concat([Object.assign({}, slot, { player: bestPlayer, isUser: false })]),
                        currentIdx: prev.currentIdx + 1,
                        teamRosters: newRosters,
                    });
                });
            }, 500);
            return function() { clearTimeout(timer); };
        }, [phase, currentIdx, isDone]);

        function startDraft() {
            var pool = buildPool(playersData);
            if (pool.length < 20) {
                alert('Not enough player data loaded. Please wait a moment and try again.');
                return;
            }
            var sz = parseInt(leagueSize);
            var rd = parseInt(rounds);
            var pos = parseInt(draftPos);
            setDraftState({
                order: buildDraftOrder(sz, rd, format),
                available: pool,
                picks: [],
                currentIdx: 0,
                teamRosters: {},
                userTeamIndex: pos,
                leagueSize: sz,
                rounds: rd,
            });
            setPhase('drafting');
        }

        function userPick(player) {
            if (!draftState || !isUserTurn) return;
            setDraftState(function(prev) {
                var slot = prev.order[prev.currentIdx];
                var newAvail = prev.available.filter(function(p) { return p.pid !== player.pid; });
                var newRosters = Object.assign({}, prev.teamRosters);
                newRosters[slot.teamIndex] = (newRosters[slot.teamIndex] || []).concat([player]);
                return Object.assign({}, prev, {
                    available: newAvail,
                    picks: prev.picks.concat([Object.assign({}, slot, { player: player, isUser: true })]),
                    currentIdx: prev.currentIdx + 1,
                    teamRosters: newRosters,
                });
            });
        }

        function resetDraft() {
            setDraftState(null);
            setPhase('setup');
        }

        // ── RENDER: Setup ────────────────────────────────────────
        if (phase === 'setup') {
            var ddStyle = {
                background: 'var(--off-black)', color: 'var(--white)',
                border: '1px solid rgba(212,175,55,0.3)', borderRadius: '6px',
                padding: '6px 10px', fontSize: '0.85rem', cursor: 'pointer', minWidth: '90px',
            };
            var labelStyle = { fontSize: '0.72rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px', fontFamily: 'Rajdhani, sans-serif' };
            var fieldStyle = { display: 'flex', flexDirection: 'column', gap: '4px' };

            return e('div', { style: { padding: '20px', fontFamily: 'DM Sans, sans-serif' } },
                e('div', { style: { fontSize: '0.72rem', color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'Rajdhani, sans-serif', marginBottom: '16px' } },
                    'Mock Draft Simulator'),
                e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', maxWidth: '360px', marginBottom: '24px' } },
                    e('div', { style: fieldStyle },
                        e('div', { style: labelStyle }, 'Rounds'),
                        e('select', { style: ddStyle, value: rounds, onChange: function(ev) { setRounds(parseInt(ev.target.value)); } },
                            [1,2,3,4,5].map(function(n) { return e('option', { key: n, value: n }, n + ' Round' + (n > 1 ? 's' : '')); })
                        )
                    ),
                    e('div', { style: fieldStyle },
                        e('div', { style: labelStyle }, 'Draft Position'),
                        e('select', { style: ddStyle, value: draftPos, onChange: function(ev) { setDraftPos(parseInt(ev.target.value)); } },
                            Array.from({ length: 12 }, function(_, i) { return e('option', { key: i+1, value: i+1 }, 'Pick #' + (i+1)); })
                        )
                    ),
                    e('div', { style: fieldStyle },
                        e('div', { style: labelStyle }, 'Format'),
                        e('select', { style: ddStyle, value: format, onChange: function(ev) { setFormat(ev.target.value); } },
                            e('option', { value: 'snake' }, 'Snake'),
                            e('option', { value: 'linear' }, 'Linear')
                        )
                    ),
                    e('div', { style: fieldStyle },
                        e('div', { style: labelStyle }, 'Teams'),
                        e('select', { style: ddStyle, value: leagueSize, onChange: function(ev) { setLeagueSize(parseInt(ev.target.value)); } },
                            [8,10,12,14,16].map(function(n) { return e('option', { key: n, value: n }, n + ' Teams'); })
                        )
                    )
                ),
                e('button', {
                    style: {
                        background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px',
                        padding: '10px 28px', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer',
                        fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.05em', textTransform: 'uppercase',
                    },
                    onClick: startDraft,
                }, 'Start Mock Draft')
            );
        }

        // ── RENDER: Complete ─────────────────────────────────────
        if (phase === 'complete') {
            var allPicks = draftState ? draftState.picks : [];
            var myPicksList = allPicks.filter(function(p) { return p.isUser; });
            var gradeInfo = calcGrade(myPicksList);
            var posTally = {};
            myPicksList.forEach(function(p) { posTally[p.player.pos] = (posTally[p.player.pos] || 0) + 1; });

            return e('div', { style: { padding: '20px', fontFamily: 'DM Sans, sans-serif' } },
                e('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' } },
                    e('div', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '0.72rem', color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.1em' } }, 'Draft Complete — Grade'),
                    e('div', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '2.4rem', fontWeight: '700', color: gradeInfo.color, lineHeight: 1 } }, gradeInfo.grade)
                ),
                e('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' } },
                    Object.entries(posTally).map(function(entry) {
                        return e('div', {
                            key: entry[0],
                            style: { background: posColor(entry[0]), color: '#000', padding: '2px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: '700' }
                        }, entry[0] + ' \u00d7' + entry[1]);
                    })
                ),
                e('div', { style: { fontSize: '0.72rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'Rajdhani, sans-serif', marginBottom: '8px' } }, 'My Picks'),
                e('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '20px' } },
                    myPicksList.map(function(pk) {
                        return e('div', {
                            key: pk.overall,
                            style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', background: 'var(--charcoal)', borderRadius: '6px', fontSize: '0.83rem' }
                        },
                            e('span', { style: { color: 'var(--silver)', minWidth: '42px', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem' } },
                                'R' + pk.round + '.' + String(pk.pick).padStart(2, '0')),
                            e('span', {
                                style: { background: posColor(pk.player.pos), color: '#000', padding: '1px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '700', minWidth: '26px', textAlign: 'center' }
                            }, pk.player.pos),
                            e('span', { style: { color: 'var(--white)', fontWeight: '500', flex: 1 } }, pk.player.name),
                            e('span', { style: { color: 'var(--silver)', fontSize: '0.75rem' } }, pk.player.team)
                        );
                    })
                ),
                e('button', {
                    style: {
                        background: 'transparent', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.4)',
                        borderRadius: '6px', padding: '8px 20px', fontSize: '0.82rem', cursor: 'pointer',
                    },
                    onClick: resetDraft,
                }, 'New Mock Draft')
            );
        }

        // ── RENDER: Drafting ─────────────────────────────────────
        var order = draftState ? draftState.order : [];
        var available = draftState ? draftState.available : [];
        var allPicksMade = draftState ? draftState.picks : [];
        var sz = draftState ? draftState.leagueSize : 12;
        var rd = draftState ? draftState.rounds : 3;

        // Build pickMap: "teamIndex-round" -> pick
        var pickMap = {};
        allPicksMade.forEach(function(pk) { pickMap[pk.teamIndex + '-' + pk.round] = pk; });

        var topAvailable = available.slice(0, 30);

        return e('div', { style: { padding: '12px 16px', fontFamily: 'DM Sans, sans-serif' } },

            // Header
            currentSlot && e('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' } },
                e('div', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '0.72rem', color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.08em' } },
                    'Round ' + currentSlot.round + ' of ' + rd + ' \u2014 Pick ' + currentSlot.overall),
                isUserTurn && e('div', { style: { background: 'rgba(212,175,55,0.15)', border: '1px solid var(--gold)', color: 'var(--gold)', borderRadius: '4px', padding: '2px 10px', fontSize: '0.72rem', fontWeight: '700', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.06em' } },
                    '\u26a1 ON THE CLOCK'),
                !isUserTurn && e('div', { style: { color: 'var(--silver)', fontSize: '0.72rem', opacity: 0.6 } }, 'AI picking\u2026')
            ),

            // On the clock player picker
            isUserTurn && e('div', { style: { marginBottom: '16px' } },
                e('div', { style: { fontSize: '0.7rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'Rajdhani, sans-serif', marginBottom: '6px' } },
                    'Select a Player'),
                e('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '240px', overflowY: 'auto' } },
                    topAvailable.map(function(p) {
                        return e('div', {
                            key: p.pid,
                            style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: 'var(--charcoal)', borderRadius: '5px', cursor: 'pointer', transition: 'background 0.12s' },
                            onMouseEnter: function(ev) { ev.currentTarget.style.background = 'rgba(212,175,55,0.12)'; },
                            onMouseLeave: function(ev) { ev.currentTarget.style.background = 'var(--charcoal)'; },
                            onClick: function() { userPick(p); },
                        },
                            e('span', { style: { color: 'var(--silver)', minWidth: '28px', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem' } }, '#' + p.rank),
                            e('span', { style: { background: posColor(p.pos), color: '#000', padding: '1px 5px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '700', minWidth: '24px', textAlign: 'center' } }, p.pos),
                            e('span', { style: { flex: 1, color: 'var(--white)', fontSize: '0.85rem', fontWeight: '500' } }, p.name),
                            e('span', { style: { color: 'var(--silver)', fontSize: '0.75rem', minWidth: '30px' } }, p.team),
                            e('span', { style: { color: 'var(--gold)', fontSize: '0.72rem', fontFamily: 'JetBrains Mono, monospace', minWidth: '42px', textAlign: 'right' } },
                                p.dynastyValue > 0 ? p.dynastyValue.toLocaleString() : '')
                        );
                    })
                )
            ),

            // Draft board grid
            e('div', { style: { fontSize: '0.7rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'Rajdhani, sans-serif', marginBottom: '6px' } }, 'Draft Board'),
            e('div', { style: { overflowX: 'auto' } },
                e('table', { style: { borderCollapse: 'collapse', minWidth: '100%', fontSize: '0.72rem' } },
                    e('thead', null,
                        e('tr', null,
                            e('th', { style: { padding: '4px 8px', color: 'var(--silver)', fontWeight: '600', textAlign: 'left', whiteSpace: 'nowrap', background: 'var(--off-black)', position: 'sticky', left: 0, zIndex: 1 } }, 'RD'),
                            Array.from({ length: sz }, function(_, i) {
                                var ti = i + 1;
                                var isMe = ti === userTeamIdx;
                                return e('th', {
                                    key: ti,
                                    style: {
                                        padding: '4px 6px', minWidth: '72px', textAlign: 'center', whiteSpace: 'nowrap',
                                        color: isMe ? 'var(--gold)' : 'var(--silver)',
                                        fontWeight: isMe ? '700' : '400',
                                        background: isMe ? 'rgba(212,175,55,0.06)' : 'transparent',
                                    }
                                }, isMe ? 'YOU' : 'T' + ti);
                            })
                        )
                    ),
                    e('tbody', null,
                        Array.from({ length: rd }, function(_, ri) {
                            var r = ri + 1;
                            return e('tr', { key: r, style: { borderTop: '1px solid rgba(255,255,255,0.04)' } },
                                e('td', { style: { padding: '4px 8px', color: 'var(--gold)', fontFamily: 'JetBrains Mono, monospace', fontWeight: '700', background: 'var(--off-black)', position: 'sticky', left: 0 } }, r),
                                Array.from({ length: sz }, function(_, ci) {
                                    var ti = ci + 1;
                                    var pk = pickMap[ti + '-' + r];
                                    var isMe = ti === userTeamIdx;
                                    var isCurrent = currentSlot && currentSlot.round === r && currentSlot.teamIndex === ti;
                                    return e('td', {
                                        key: ti,
                                        style: {
                                            padding: '3px 5px', textAlign: 'center', verticalAlign: 'middle',
                                            background: isMe ? 'rgba(212,175,55,0.06)' : isCurrent ? 'rgba(255,255,255,0.03)' : 'transparent',
                                            border: isCurrent ? '1px solid rgba(212,175,55,0.4)' : '1px solid transparent',
                                        }
                                    },
                                        pk ? e('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' } },
                                            e('span', { style: { background: posColor(pk.player.pos), color: '#000', padding: '0 4px', borderRadius: '3px', fontSize: '0.62rem', fontWeight: '700', lineHeight: '14px' } }, pk.player.pos),
                                            e('span', { style: { color: pk.isUser ? 'var(--gold)' : 'var(--silver)', fontSize: '0.65rem', whiteSpace: 'nowrap', maxWidth: '68px', overflow: 'hidden', textOverflow: 'ellipsis' } },
                                                pk.player.name.split(' ').slice(-1)[0])
                                        ) : isCurrent ? e('span', { style: { color: 'var(--gold)', fontSize: '0.8rem' } }, '\u25b6') : null
                                    );
                                })
                            );
                        })
                    )
                )
            )
        );
    }

    window.MockDraftSimulator = MockDraftSimulator;

})();
