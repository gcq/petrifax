const l = require('debug')('bot:utils')

const _ = require('lodash')
const Extra = require('telegraf/extra')

const data = require('./data.db')

const re = RegExp('.*[.?!]$')

module.exports = {
  isFinish: function isFinish(s) {
    return re.test(s)
  },

  isOwner: function isOwner(ctx) {
    return [data.ownerId].includes(ctx.message.from.id)
  },

  isAdmin: async function isAdmin(ctx) {
    if (ctx.message.chat.type === 'private') return true

    try {
      var members = await ctx.getChatAdministrators(ctx.message.chat.id)
      
      if (this.isOwner(ctx) || _(members).map((el) => el.user.id).includes(ctx.message.from.id)) {
        l('admin:true')
        return true
      } else {
        l('admin:false')
        return false
      }
    } catch (e) {
      l(e)

      l('admin:error')
      return false
    }
  },

  isChatAuthorised: async function isChatAuthorised(ctx) {
    let a = await data.get_pref(ctx.message.chat.id, 'auth')
    
    if (a === undefined || a === null) {
      data.set_pref(ctx.message.chat.id, 'auth', false)
      a = false
    }

    l("auth:" + ctx.message.chat.id + ":" + a)

    return a
  },

  /*
  Creates user if it doesnt exist. If it exists, updates its data.
  Adds user to chat.
  */
  addUserToChat: async function addUserToChat(ctx) {
    if (ctx.message.from.is_bot) return

    let userid = ctx.message.from.id, chatid = ctx.message.chat.id
    if (!await data.exists_user(userid))
      await data.create_user(userid, ctx.message.from.username, ctx.message.from.first_name, ctx.message.from.last_name)

    //Update user data
    await data.getDb().run('UPDATE users SET username = ?, name = ?, surname = ? WHERE userid = ?',
      ctx.message.from.username, ctx.message.from.first_name, ctx.message.from.last_name, userid)

    await data.add_user_to_group(userid, chatid)

    l(`new user ${userid} in chat ${chatid}`)
  },

  mentionEveryone: async function mentionEveryone(ctx) {
    let groupid = ctx.message.chat.id
    var users = await data.get_group_users(groupid)

    if(!users) return

    var computedUsers = users.map(async (userid) => {
      var response = await ctx.telegram.getChatMember(groupid, userid)
      var user = response.user
      var name = user.username ? '@' + user.username : user.first_name
      return `[${name}](tg://user?id=${userid})`
    })

    Promise.all(computedUsers).then((res) => {
      ctx.reply(res.join(' '), Extra.markdown())
    })
  },

  incrementCount: async function incrementCount(ctx) {
    if (!await data.get_pref(ctx.message.chat.id, 'count')) await data.set_pref(ctx.message.chat.id, 'count', 0)
    await data.set_pref(ctx.message.chat.id, 'count', parseInt(await data.get_pref(ctx.message.chat.id, 'count')) + 1)
  },

  resetCount: async function resetCount(ctx) {
    await data.set_pref(ctx.message.chat.id, 'count', 0)
  },

  checkPermission: async function checkPermission(ctx, permission, def = 'admin') {
    if (this.isOwner(ctx)) return true
    
    var value = await data.get_pref(ctx.message.chat.id, 'permission.' + permission)
    if (!value) value = def

    if (value === 'admin' && await this.isAdmin(ctx)) return true
    
    if (value === 'off') return false
    if (value === 'on') return true
  }
}
