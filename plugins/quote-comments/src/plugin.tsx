import { definePlugin } from '@gidragir/bifrost'
import { appendComments, countLabel } from './comments'
import { capture, clear, comments, PANE } from './store'
import { CommentsPane } from './ui'

const NO_PANE =
  'No selection is shared here and the Comments pane cannot be shown: select text in the chat first (in the terminal this works in fullscreen mode only).'

export default definePlugin({
  name: 'quote-comments',
  displayName: 'Quote Comments',
  version: '0.3.0',
  description: 'Comment on text selected in the chat: collect quoted comments and append them to your next message',

  panes: {
    [PANE]: { title: 'Comments', component: CommentsPane },
  },

  commands: {
    comment: {
      description: 'Comment on the text selected in the chat; the comment is appended to your next message',
      argumentHint: '[comment]',
      run: async (host, args) => {
        const kind = await capture(host, args)
        if (kind === 'hidden') return NO_PANE
        if (kind === 'saved') host.toast(`Comment saved: ${countLabel((await host.get(comments)).length)} for your next message`)
        if (kind === 'paste') host.toast('The selection is not shared here: paste the quote into the Comments pane')
        return undefined
      },
    },
  },

  claude: {
    // The next message carries the comments; the list is cleared once it went through.
    promptSubmit: async (host, e) => {
      const list = await host.get(comments)
      if (e.command !== undefined || e.isMeta === true || list.length === 0) return undefined
      return {
        text: appendComments(e.text, list),
        after: async () => {
          await clear(host)
          await host.pane.close(PANE)
        },
      }
    },
  },
})
