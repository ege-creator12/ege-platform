'use strict';
module.exports={
 ...require('./chemistry-bank-foundations'),
 ...require('./chemistry-bank-inorganic'),
 ...require('./chemistry-bank-organic'),
 ...require('./chemistry-bank-processes'),
 ...require('./chemistry-bank-calculations'),
 ...require('./chemistry-bank-extended'),
 ...require('./chemistry-bank-foundations-ege'),
 ...require('./chemistry-bank-core-ege'),
 // core-ege keeps compact legacy pools for lines 14-16. Restore the richer
 // ten-scenario organic builders before applying the later first-part overrides.
 ...require('./chemistry-bank-organic'),
 ...require('./chemistry-bank-first-part-ege'),
 ...require('./chemistry-bank-diverse-v3')
};
