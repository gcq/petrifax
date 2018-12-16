const data = require('./data.db.js')
const json = require('./db.json')
const _ = require('lodash')

const l = require('debug')('bot:dbtest')
l.enabled = true

async function main() {
    l('INICIO')

    l('Preparando bd')

    try {
        await data.open('db.sqlite3')
    } catch (e) {
        l(e)
    }

    try {

        let sql = _(json.groups)
            .entries()
            .map(([groupid, v]) => {
                l(groupid)
                let sql = `INSERT INTO groups VALUES ('${groupid}');\n`

                _(v)
                    .entries()
                    .forEach(([key, value]) => {
                        if (key === "__pref__")
                            _(value).entries().forEach(([pref, val]) => sql += `INSERT INTO group_preferences VALUES ('${groupid}', '${pref}', '${JSON.stringify({x: val})}');\n`)

                        else {
                            let [a, b] = key.split('|')
                            _(value).forEach((c) => {
                                let isstart = `${/^[A-Z\-¿¡]/.test(a)}`.toUpperCase()
                                let isend = `${/[.?!]$/.test(c)}`.toUpperCase()
                                a = a.replace(/'/g, "''")
                                b = b.replace(/'/g, "''")
                                c = c.replace(/'/g, "''").replace(/\.$/, '')
                                sql += `INSERT INTO parts(groupid, a, b, c, isstart, isend) VALUES ('${groupid}', '${a}', '${b}', '${c}', ${isstart}, ${isend});\n`
                            })
                        }
                    })

                return sql
            })
            .value()

        await data.getDb().exec('BEGIN TRANSACTION;' + sql.join('') + 'COMMIT TRANSACTION;')
            
    } catch (e) {
        l(e)
    }

    l('Cerrando bd')
    
    await data.close()

    l('FIN')
}

main()