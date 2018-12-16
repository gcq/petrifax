const sqlite = require('sqlite')
const fs = require('fs')

const l = require('debug')('bot:data')
const sql_log = require('debug')('bot:sql')

let db

async function open(fname) {
  l('Opening bd')

  db = await sqlite.open(fname)

  l('Done')

  db.on('error', (err) => l('Ooops' + err))
  
  db.on('trace', (sql) => {sql_log(sql)})

  l('Db events subscribed')
  
  l('Readying schema')

  await db.run(`PRAGMA foreign_keys = ON`)

  let ver
  try {
    ver = (await db.get(`SELECT value FROM database WHERE property = 'database.version'`)).value
  } catch (e) {
    l('No table "database". Setting version to -1')
    ver = "-1"
  }

  l(`DB.VER = ${ver}`)

  if (!ver) {
    l('First execution. Loading all migrations.')
    ver = '-1'
  }

  ver = parseInt(ver)

  let migrations = fs.readdirSync('./sql')  // Leemos el directorio de migraciones
    .map((f) => f.split('.')[0])            // Extraemos el nombre del archivo sin extensión
    .map((i) => parseInt(i))                // Lo convertimos a int
    .filter((i) => i > ver)                 // Filtramos las migraciones innecesarias
    .map((i) => `./sql/${i}.sql`)           // Volvemos a convertir a nombre de fichero .sql

  if (migrations.length > 0) {
    l('Applying the following migrations: ' + migrations.join(', '))

    for (fname of migrations) {
      l(`Applying '${fname}'`)
      let contents = fs.readFileSync(fname)
      try {
        await db.exec(contents.toString())
      } catch (e) {
        l('ERROR executing migration ' + fname)
        l(e)
        l('ABORT')
        process.exit()
      }
    }
  
    l('Applied necessary migrations')
    
    ver = (await db.get(`SELECT value FROM database WHERE property = 'database.version'`)).value
    l(`DB.VER = ${ver}`)
  }

  l('Db ready')

  return ver
}

async function close() {
  try {
      await db.close()

      db = null

  } catch (e) {
      l(`ERROR: ${e}`)
  }
}

module.exports = {
  open,
  close,
  getDb: () => db,

  exists_group: async function exists_group(groupid) {
    return !!(await db.get('SELECT * FROM groups WHERE groupid = ?', groupid))
  },

  create_group: async function create_group(groupid, name) {
    if (!name) name = null
    l(`create group ${groupid} - ${name}`)
    
    try {
      await db.run('INSERT INTO groups (groupid, name) values (?, ?)', groupid, name)
    } catch (e) {
      l(groupid, e)
    }
  },

  update_group_data: async function update_group_data(groupid, title) {
    l(`update group ${groupid} - ${title}`)
    await db.run('UPDATE groups SET name = ? WHERE groupid = ?', title, groupid)
  },

  remove_group: async function remove_group(groupid) {
    l(`remove group ${groupid}`)
    
    await db.run('DELETE FROM groups WHERE groupid = ?', groupid)
  },

  exists_user: async function exists_user(userid) {
    return !!(await db.get('SELECT * FROM users WHERE userid = ?', userid))
  },

  create_user: async function create_user(userid, username, name, surname) {
    if (!username) username = null
    if (!name) name = null
    if (!surname) surname = null
    l(`create user ${userid} - ${name}, ${surname}, @${username}`)

    await db.run('INSERT INTO users (userid, username, name, surname) values (?, ?, ?, ?)', userid, username, name, surname)
  },

  add_user_to_group: async function add_user_to_group(userid, groupid) {
    await db.run('INSERT INTO group_users VALUES (?, ?)', groupid, userid)
  },

  remove_user_from_group: async function remove_user_from_group(userid, groupid) {
    await db.run('DELETE FROM group_users WHERE userid = ? AND groupid = ?', userid, groupid)
  },

  get_group_users: async function get_group_users(groupid) {
    return (await db.all('SELECT (userid) FROM group_users WHERE groupid = ?', groupid)).map(e => e.userid)
  },

  add_message: async function add_message(groupid, triplet, userid, isstart, isend) {
    let key = `${triplet[0]}|${triplet[1]}`
    let val = triplet[2]

    if (!userid) userid = null
    if (!isstart) isstart = false
    if (!isend) isend = false

    l(`add_message to ${groupid}: ${key} - ${val} - start:${isstart} end:${isend}`)

    await db.run('INSERT INTO parts(a, b, c, groupid, userid, isstart, isend) VALUES (?, ?, ?, ?, ?, ?, ?)', triplet[0], triplet[1], triplet[2], groupid, userid, isstart, isend)
  },

  get_sentence: async function get_sentence(groupid) {
    if (!this.exists_group(groupid)) return null

    let key = await db.get('SELECT a, b, c, isend FROM parts WHERE isstart = 1 AND groupid = ? ORDER BY random() LIMIT 1', groupid)

    if (!key) return null

    let sentence = [key.a, key.b, key.c]
    let turns = 0

    let ended = key.isend === 1 ? true : false
    while (!ended) {
      key = await db.get('SELECT id, a, b, c, isend FROM parts WHERE a = ? AND b = ? AND groupid = ? ORDER BY random() LIMIT 1', key.b, key.c, groupid)
  
      if (!key) break

      sentence = sentence.concat([key.c])
      
      turns += 1
      ended = key.isend === 1 ? true : false
    }

    let res = sentence.join(' ')
    res = res + (/[^.?!]$/.test(res) ? '.' : '')

    return res
  },

  exists_pref_in_group: async function exists_pref_in_group(group, pref) {
    return !!(await db.get('SELECT * FROM group_preferences WHERE groupid = ? AND pref = ?', group, pref))
  },

  create_pref_in_group: async function create_pref_in_group(group, pref, val) {
    if (!val) val = null;
    l(`create pref in ${group}: ${pref} -> ${val}`)

    val = JSON.stringify({x: val})

    await db.run('INSERT INTO group_preferences VALUES (?, ?, ?)', group, pref, val)
  },

  set_pref: async function set_pref(group, pref, val) {
    l(`set pref in ${group}: ${pref} -> ${val}`)
    
    if (!await this.exists_pref_in_group(group, pref))
      await this.create_pref_in_group(group, pref, val)
    
    else {
      val = JSON.stringify({x: val})
      await db.run('UPDATE group_preferences SET value = ? WHERE groupid = ? AND pref = ?', val, group, pref)
    }
  },

  get_pref: async function get_pref(group, pref) {
    l(`get pref in ${group}: ${pref}`)

    let p = await db.get('SELECT value FROM group_preferences WHERE groupid = ? AND pref = ?', group, pref)

    p = p ? JSON.parse(p.value).x : p

    l(`val: ${p}`)

    return p
  }
}
