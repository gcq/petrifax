const Telegraf = require('telegraf')
const Extra = require('telegraf/extra')
const Markup = require('telegraf/markup')
const _ = require('lodash')

const config = require('./config')
const utils = require('./utils')
const data = require('./data.db')  //Circular dependency on utils

const l = require('debug')('bot:index')
const m = require('debug')('bot:index:msg')
//require('debug').enable('*')

const bot = new Telegraf(config.api_token)

bot.use(Telegraf.log())

bot.catch((err) => {
  console.log('Ooops', err)
})

l('Loading bot data...')
bot.telegram.getMe().then(async (bot_informations) => {
  l('Loaded.')
  bot.options.username = bot_informations.username
  bot.options.id = bot_informations.id
  l("Our username: " + bot_informations.username)

  l('Opening database...')
  let ver = await data.open("db.sqlite3")
  l('Opened.')

  process.on('SIGINT', async function() {
    l("CTRL-C MotherFucker")

    l('Closing database')
    await data.close()

    l('Stoping message polling')
    await new Promise(function (resolve, reject) {
      bot.stop(resolve)
    })

    l('Good bye!')
    process.exit()
  })

  if (ver > 1) l('REMOVE THIS AFTER VER > 1 !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
  l('Updating group data...')
  
  let groups = (await data.getDb().all('SELECT groupid FROM groups WHERE name IS NULL'))
  .map((g) => g.groupid)
  
  if (groups.length > 0) {
    l('Actualitzant titols dels grups: ' + groups.join(', '))
  }
  
  for (groupid of groups) {
    l(`Actualitzant grup ${groupid}`)
    let groupData
    try {
      groupData = await bot.telegram.getChat(groupid)
    } catch (e) {
      let notfound = /chat not found/g.test(e.description)
      //TODO DELETE?
      l(`Error actualitzant chat ${groupid} ${notfound ? '- no trobat' : ''}`)
      continue
    }
    
    let name = groupData.title || groupData.username
    await data.update_group_data(groupid, name)
  }
  if (ver > 1) l('REMOVE THIS AFTER VER > 1 !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
  
  l('Start message polling')
  bot.startPolling()
})

bot.start((ctx) => {
  l('Started')
})

bot.command('/ajuda', (ctx) => ctx.reply(`
Posa'm a un grup i deixa'm escoltar. Apendré com parla la gent del grup.

Quan volguis que parli escriu /parla i us intentaré imitar.

/all (o @all) mencionarà a tots els usuaris del grup.

Per ajuda amb comandes d'administració veure /ajuda_admins

Abans de fer servir el bot en un grup haurà de ser autoritzat per un moderador del bot.
Contacta amb @gucruqu, amb la id del grup en el que vols activar el bot (utilitza /id).
`))

bot.command('/ajuda_admins', (ctx) => ctx.reply(`
Fes servir /alzheimer per resetejar el bot a aquest grup. No demana confirmació. No em faig responsable.

/automessage estableix cada quants missatges el bot pren la decisió de parlar per si sol.

Es pot configurar qui pot executar les comandes. Veure /ajuda_permisos
`))

bot.command('/ajuda_permisos', (ctx) => ctx.reply(`
Es pot configurar qui pot executar les comandes mitjançant /permission.

Permisos disponibles: 
  - parla: executar /parla. Per defecte all.
  - automessage: executar /automessage. Per defecte admin.
  - all: Fer servir /all o @all. Per defecte admin.

Nivells de permisos: off (ningú), all (tothom), admin (només administradors)

Ex: "/permission all all" (tothom pot fer servir /all)
Ex: "/permission automessage off" (ningú pot fer servir la comanda)
`))

bot.command('/id', (ctx) => ctx.reply(`La id del xat es aquesta (amb guions inclosos): ${ctx.message.chat.id}`))

bot.command('/auth', async (ctx) => {
  l('/auth')

  if (utils.isOwner(ctx)) {
    var id = ctx.update.message.text
      .replace('/auth', '')
      .replace(`@${bot.options.username}`, '')
      .trim()
    
    if (!id) return await ctx.reply('/auth <id>')

    await data.set_pref(id, 'auth', true)

    await ctx.telegram.sendMessage(id, 'Bot activat!').then(ctx.reply('Authoritzat'))

  } else await ctx.reply('Si home estem tontos o que??!! A tu no et faré cas tss')
})

bot.command('/permission', async (ctx) => {
  l('/permission')

  var isadmin = await utils.isAdmin(ctx)

  l('is admin = ' + isadmin)

  if (!isadmin) return await ctx.reply(`No tens permisos per executar aquesta opció`)

  var input = ctx.update.message.text
      .replace('/permission', '')
      .replace(`@${bot.options.username}`, '')
      .trim()
  
  if (!input) return await  ctx.reply(`El format de la comanda és (/ajuda):\n/permission <nom_permís> <valor>`)

  var [permission, value] = input.split(' ')

  permission = 'permission.' + permission

  const off = ['off', 'disabled', '0']
  const on = ['on', 'enabled', '1', 'everyone', 'users', 'all']
  const admin = ['admin']

  if (off.includes(value)) value = 'off'
  if (on.includes(value)) value = 'on'
  if (admin.includes(value)) value = 'admin'

  await data.set_pref(ctx.message.chat.id, permission, value)

  await ctx.reply(`${permission} -> ${value}`)
})

bot.command('/parla', async (ctx) => {
  l('/parla')

  if (!await utils.isChatAuthorised(ctx)) return await ctx.reply('No autoritzat.')

  var allowed = await utils.checkPermission(ctx, 'parla', 'on')

  if (!allowed) return await ctx.reply(`No tens permisos per executar aquesta opció`)

  await utils.resetCount(ctx)

  var res = await data.get_sentence(ctx.message.chat.id)

  l(`response: ${res}`)

  if (res === null) res = `Encara no he après res d'aquest grup!`

  await ctx.reply(res)
})

bot.command('/alzheimer', async (ctx) => {
  l('/alzheimer ' + ctx.message.chat.id)

  if (!await utils.isChatAuthorised(ctx)) return await ctx.reply('No autoritzat.')

  try {
    if (await utils.isAdmin(ctx)) {
      l('issuer is admin. obeying...')

      await data.remove_group(ctx.message.chat.id)
      ctx.reply('Gugu gaga sóc tonto')

    } else {
      await ctx.reply(`Només ho pot executar l'admin del grup`)
    }
  } catch (e) {
    await ctx.reply('Error trobant els admins del grup')
  }
})

bot.command('/automessage', async (ctx) => {
  l('/automessage')

  if (!await utils.isChatAuthorised(ctx)) return await ctx.reply('No autoritzat.')

  var allowed = await utils.checkPermission(ctx, 'automessage', 'admin')
  if (allowed) {
    var n = parseInt(ctx.update.message.text
      .replace('/automessage', '')
      .replace(`@${bot.options.username}`, '')
      .trim())

    if (!n) n = 50

    await data.set_pref(ctx.message.chat.id, 'automessage', n)

    l(`automessage set to ${n}`)

    await ctx.reply(`Configurat per 1 missatge cada ${n}`)
    
  } else {
    await ctx.reply(`No tens permisos per executar aquesta opció`)
  }
})

async function all(ctx) {
  if (!await utils.isChatAuthorised(ctx)) return ctx.reply('No autoritzat.')

  var allowed = await utils.checkPermission(ctx, 'all', 'admin')

  if (allowed) await utils.mentionEveryone(ctx)
}

bot.command('/all', async (ctx) => {
  l('/all')

  await all(ctx)
})

bot.hears(/@all/g, async (ctx) => {
  l('heard @all')

  await all(ctx)
})

bot.on('message', async (ctx) =>  {
  l('message')

  let isAuthorized = await utils.isChatAuthorised(ctx)

  l(`chat is${isAuthorized ? '' : ' NOT '}authorized`)

  if (!await data.exists_group(ctx.message.chat.id))
    await data.create_group(ctx.message.chat.id, ctx.message.chat.title || ctx.message.chat.username)

  await utils.addUserToChat(ctx)

  // Title change
  if (ctx.message.new_chat_title) {
    let title = ctx.message.new_chat_title
    l('New chat title:', title)
    
    await data.update_group_data(ctx.message.chat.id, ctx.message.chat.title || ctx.message.chat.username)
    
    return
  }
  
  // Supergroup migration
  if (ctx.message.migrate_from_chat_id) {
    let newid = ctx.message.chat.id
    let oldid = ctx.message.migrate_from_chat_id
    let name = ctx.message.chat.title
    l('migrate to supergroup: ', name, oldid, newid)
    l({ctx:{message:{chat:{id:oldid}}}})

    let authed = await utils.isChatAuthorised({message:{chat:{id:oldid}}})
    
    await ctx.reply(`He detectat que el grup amb nom ${name} s'ha migrat a un supergrup
    
    He transferit tot el que vaig apendre a aquest supergrup.
    
    Si aquest no era el comportament desitjat, parla amb l'administrador del bot.
    
    Aquest xat ${authed ? 'NO' : 'sí'} està autoritzat.

    (${oldid} -> ${newid})`)

    await data.getDb().run('UPDATE groups SET groupid = ? WHERE groupid = ?', newid, oldid)

    return
  }

  // User left
  if (ctx.message.left_chat_member) {
    let user = ctx.message.left_chat_member

    l('user left', user.id)

    if (user.id === bot.options.id) {
      l('i have been removed :(')

      await ctx.telegram.sendMessage(data.ownerId, `I've been removed from ${JSON.stringify(ctx.message.chat)}`)

      return
    }

    await data.remove_user_from_group(user.id, ctx.message.chat.id)

    if (isAuthorized)
      await ctx.reply(`You'll be missed, ${user.first_name}`)

    return
  }

  // Users join
  if (ctx.message.new_chat_members) {
    let chat = ctx.message.chat
    let users = ctx.message.new_chat_members

    l('users joined', users)

    for (user of users) {
      if (user.id === bot.options.id) {
        l('i have been added :)')

        await data.create_group(chat.id, chat.title)
        await ctx.telegram.sendMessage(data.ownerId, `I've been added to ${JSON.stringify(ctx.message.chat)}`)
        await ctx.reply(`HOLA ${chat.title}! Mireu tot el que puc fer a /ajuda`)
      }

      await data.create_user(user.id, user.username, user.first_name, user.last_name)
      await data.add_user_to_group(user.id, chat.id)
    }

    if (users.length === 1 && users[0].id !== bot.options.id && isAuthorized)
      await ctx.reply(`Hola ${users[0].first_name}!`)

    return
  }

  // ######################## AUTHORIZED CHATS ###########################
  if (!isAuthorized) return

  await utils.incrementCount(ctx)

  //if (ctx.message.chat.type === 'private') return
  if (!ctx.message.text) return

  var text = ctx.message.text.replace(/\n+/g, '.').replace(/\|/g, '')
  m(`${ctx.message.from.first_name} ${ctx.message.from.last_name}: ${text}`)

  for (part of text.split('.').map((part) => part.trim() + '.')) {
    aux = part.split(' ')

    if (aux.length < 3)
      break

    l('Saving parts')

    var zipped = _.zip(_.drop(aux, 0), _.drop(aux, 1), _.drop(aux, 2))
    
    zipped = _(zipped)
      .dropRight(2)
      .value()

    for (let i = 0; i < zipped.length; i++)
      await data.add_message(ctx.message.chat.id, zipped[i], ctx.message.from.id, i === 0, i === zipped.length - 1)
  }

  //if (ctx.message.chat.type === 'private') ctx.reply('OK')

  if (ctx.message.entities) {
    var mentions = ctx.message.entities
      .filter((el) => el.type === 'mention')
      .map((el) => ctx.message.text.substr(el.offset, el.length))

    if (mentions.includes('@' + bot.options.username)) {
      l('mentioned')
      await utils.resetCount(ctx)

      var res = await data.get_sentence(ctx.message.chat.id)
      l(`mentioned: ${res}`)
      await ctx.reply(res, {reply_to_message_id: ctx.message.message_id})
    }
  }

  if (ctx.message.reply_to_message && ctx.message.reply_to_message.from.id === bot.options.id) {
    l('replied to')
    await utils.resetCount(ctx)

    var res = await data.get_sentence(ctx.message.chat.id)
    l(`reply: ${res}`)
    await ctx.reply(res, {reply_to_message_id: ctx.message.message_id})
  }

  if (await data.get_pref(ctx.message.chat.id, 'count') >= (await data.get_pref(ctx.message.chat.id, 'automessage') || +Infinity)) {
    l('automessage due')
    await utils.resetCount(ctx)

    var res = await data.get_sentence(ctx.message.chat.id)
    l(`automessage: ${res}`)
    await ctx.reply(res)
  }
})
