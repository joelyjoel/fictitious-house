Object.assign(module.exports, require('./core'))
Object.assign(module.exports, require('./location'))
Object.assign(module.exports, require('./movement'))
Object.assign(module.exports, require('./actions'))
Object.assign(module.exports, require('./sound'))
Object.assign(module.exports, require('./fashion'))
Object.assign(module.exports, require('./walk'))

module.exports.goTo = require('./goTo')
