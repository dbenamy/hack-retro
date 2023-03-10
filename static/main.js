// Pull the uuid out of the url like http://foo/retros/<uuid>
const retroId = window.location.pathname.split('/')[2]

let userName = null

const ws = new WebSocket(
  'ws://' + window.location.host + '/ws/retro/' + retroId + '/'
)

ws.onmessage = function (e) {
  const action = JSON.parse(e.data)
  console.log('Got action from server:')
  console.log(action)
  if (action.type === 'init') {
    init(action)
  } else if (action.type === 'join') {
    document.querySelector('#participants').value += (action.name + '\n')
  } else if (action.type === 'addTopic') {
    const listEl = document.querySelector('#' + action.list + '-list')
    listEl.value += (action.text + '\n')
  } else if (action.type === 'moveTopic') {
    moveTopicActionHandler(action)
  } else if (action.type === 'updateVotes') {
    updateVotesActionHandler(action)
  }
}

ws.onclose = function (e) {
  console.error('Chat socket closed unexpectedly')
}

function init (action) {
  let state = action.state
  if (!userName) {
    state = 'joining'
  }

  for (const div of document.querySelectorAll('.view')) {
    div.hidden = true
  }
  const el = document.querySelector('#' + state + '-view')
  if (el) {
    el.hidden = false
  }

  if (state === 'joining') {
    for (const person of action.people) {
      document.querySelector('#participants').value += (person.name + '\n')
    }
  } else if (state === 'brainstorming') {
    for (const topic of action.topics) {
      const listEl = document.querySelector(`#${topic.feeling}-list`)
      listEl.value += (topic.text + '\n')
    }
    document.querySelector('#happy-item').focus()
  } else if (state === 'grouping') {
    initGrouping(action)
  } else if (state === 'voting') {
    initVoting(action)
  } else if (state === 'discussion') {
    initDiscussion(action)
  }
}

// Handlers for the joining view

document.querySelector('#name').onkeydown = function (e) {
  if (e.keyCode === 13) { // enter, return
    document.querySelector('#join').click()
  }
}

document.querySelector('#join').onclick = function (e) {
  const messageInputDom = document.querySelector('#name')
  userName = messageInputDom.value
  ws.send(JSON.stringify({
    type: 'join',
    name: userName
  }))
  messageInputDom.value = ''
}

document.querySelector('#start').onclick = function (e) {
  ws.send(JSON.stringify({
    type: 'start'
  }))
}

// Handlers for the brainstorming view

document.querySelector('#happy-item').onkeydown = function (e) {
  if (e.keyCode === 13) { // enter, return
    document.querySelector('#happy-add').click()
  }
}

document.querySelector('#happy-add').onclick = function (e) {
  const inputEl = document.querySelector('#happy-item')
  const text = inputEl.value
  ws.send(JSON.stringify({
    type: 'addTopic',
    list: 'happy',
    text
  }))
  inputEl.value = ''
}

document.querySelector('#sad-item').onkeydown = function (e) {
  if (e.keyCode === 13) { // enter, return
    document.querySelector('#sad-add').click()
  }
}

document.querySelector('#sad-add').onclick = function (e) {
  const inputEl = document.querySelector('#sad-item')
  const text = inputEl.value
  ws.send(JSON.stringify({
    type: 'addTopic',
    list: 'sad',
    text
  }))
  inputEl.value = ''
}

document.querySelector('#confused-item').onkeydown = function (e) {
  if (e.keyCode === 13) { // enter, return
    document.querySelector('#confused-add').click()
  }
}

document.querySelector('#confused-add').onclick = function (e) {
  const inputEl = document.querySelector('#confused-item')
  const text = inputEl.value
  ws.send(JSON.stringify({
    type: 'addTopic',
    list: 'confused',
    text
  }))
  inputEl.value = ''
}

document.querySelector('#go-to-grouping').onclick = function (e) {
  ws.send(JSON.stringify({
    type: 'goToGrouping'
  }))
}

// Grouping view code

const workspace = document.querySelector('#grouping-workspace')
// TODO workspaceCoords is winding up with 0,0 when what this is trying to
// represent is the coords of the workspace in page-space, ie taking into
// account the margin and/or padding on the top and left of the workspace. I
// think this means that the coords that the server is working with, are in the
// coordinate system of the page rather than the workspace. This might cause
// hopefully-slight positioning bugs when users with different browsers do a
// retro together if their workspaces have different margin/padding.
const workspaceCoords = getCoords(workspace)

const divsByTopic = {}

function initGrouping (action) {
  for (const topic of action.topics) {
    const divEl = document.createElement('div')
    divEl.className = 'topic-box'
    divEl.style.cssText = 'border: 2px solid black; display: inline-block;'
    divEl.style.position = 'absolute'
    divEl.style.left = (workspaceCoords.left + topic.x) + 'px'
    divEl.style.top = (workspaceCoords.top + topic.y) + 'px'
    divEl.draggable = 'true'
    divEl.addEventListener('dragstart', dragstartHandler)
    divEl.addEventListener('dragend', dragendHandler)
    const textEl = document.createTextNode(topic.text)
    divEl.appendChild(textEl)
    workspace.appendChild(divEl)
    divsByTopic[topic.text] = divEl
    updateClustering(divEl)
  }
}

function getCoords (elem) {
  const box = elem.getBoundingClientRect()
  return screenToPageCoords(box.left, box.top)
}

// TODO give credit to SO answer where I got this.
// crossbrowser version
function screenToPageCoords (left, top) {
  const body = document.body
  const docEl = document.documentElement

  const scrollTop = window.pageYOffset || docEl.scrollTop || body.scrollTop
  const scrollLeft = window.pageXOffset || docEl.scrollLeft || body.scrollLeft

  const clientTop = docEl.clientTop || body.clientTop || 0
  const clientLeft = docEl.clientLeft || body.clientLeft || 0

  const top2 = top + scrollTop - clientTop
  const left2 = left + scrollLeft - clientLeft

  return { left: Math.round(left2), top: Math.round(top2) }
}

let beingDragged = null
let mouseXOffset = null
let mouseYOffset = null

function dragstartHandler (event) {
  const el = event.target
  const rect = el.getBoundingClientRect()
  beingDragged = el
  mouseXOffset = event.x - rect.x
  mouseYOffset = event.y - rect.y
  // It seems that it is needed to set some data to the draggable element on the dragstart event for the dragover event to be fired on the dropzone.
  // event.dataTransfer.setData('text/plain', el.id);
  event.dataTransfer.setData('text/html', null)
}

function dragendHandler (event) {
  event.preventDefault()
}

function dragenterHandler (event) {
  event.preventDefault()
}

// Track clusters locally. We'll upload them when we're done with clustering.
const clustersByTopic = {}
let nextCluster = 0

function updateClustering (div) {
  let overlapDiv = null
  for (const div2 of Object.values(divsByTopic)) {
    if (div2 !== div && elementsOverlap(div, div2)) {
      overlapDiv = div2
      break
    }
  }
  const draggedTopic = div.innerText
  if (overlapDiv) {
    const overlapTopic = overlapDiv.innerText
    const existingCluster = clustersByTopic[overlapTopic]
    if (existingCluster !== undefined) {
      clustersByTopic[draggedTopic] = existingCluster
    } else {
      clustersByTopic[draggedTopic] = nextCluster
      clustersByTopic[overlapTopic] = nextCluster
      nextCluster++
    }
  } else {
    if (clustersByTopic[draggedTopic] !== undefined) {
      delete clustersByTopic[draggedTopic]
      const topicsByCluster = getTopicByCluster(clustersByTopic)
      for (const cluster in topicsByCluster) {
        if (topicsByCluster[cluster].length <= 1) {
          for (const topic of topicsByCluster[cluster]) {
            delete clustersByTopic[topic]
          }
        }
      }
    }
  }

  const clusterColors = [
    'blue',
    'red',
    'dark green',
    'yellow',
    'purple',
    'orange'
  ]
  let nextColor = 0
  const colorsByCluster = {}
  const topicsByCluster = getTopicByCluster(clustersByTopic)
  for (const cluster in topicsByCluster) {
    colorsByCluster[cluster] = clusterColors[nextColor]
    nextColor = (nextColor + 1) % clusterColors.length
  }
  for (const topic in divsByTopic) {
    const cluster = clustersByTopic[topic]
    if (cluster === undefined) {
      divsByTopic[topic].style.borderColor = 'black'
    } else {
      divsByTopic[topic].style.borderColor = colorsByCluster[cluster]
    }
  }
}

// TODO unit test this
function elementsOverlap (el1, el2) {
  const rect1 = el1.getBoundingClientRect()
  const rect2 = el2.getBoundingClientRect()
  const verticalOverlap = !(rect1.bottom < rect2.top || rect2.bottom < rect1.top)
  const horizontalOverlap = !(rect1.right < rect2.left || rect2.right < rect1.left)
  return verticalOverlap && horizontalOverlap
}

function dragoverHandler (event) {
  event.preventDefault()

  const screenX = (event.x - mouseXOffset)
  const screenY = (event.y - mouseYOffset)
  const pageCoords = screenToPageCoords(screenX, screenY)
  // console.log(`event coords: ${event.x}, ${event.y}`)
  // console.log(`screen coords: ${screenX}, ${screenY}`)
  // console.log(`page coords: ${pageCoords.left}, ${pageCoords.top}`)
  beingDragged.style.left = pageCoords.left + 'px'
  beingDragged.style.top = pageCoords.top + 'px'

  updateClustering(beingDragged)

  const topic = beingDragged.textContent
  const x = pageCoords.left - workspaceCoords.left
  const y = pageCoords.top - workspaceCoords.top
  // console.log(`workspaceCoords:`)
  // console.log(workspaceCoords)
  // console.log(`server coords: ${x}, ${y}`)
  debouncedSendTopicPosition(topic, x, y) // TODO we may want to use some kind of id rather than the topic string
}

function sendTopicPosition (topic, x, y) {
  ws.send(JSON.stringify({
    type: 'moveTopic',
    text: topic,
    x,
    y
  }))
}

const debouncedSendTopicPosition = debounce(sendTopicPosition, 250)

function debounce (func, waitMs) {
  let timeout
  return function () {
    const context = this; const args = arguments
    const later = function () {
      timeout = null
    }
    if (!timeout) {
      timeout = setTimeout(later, waitMs)
      func.apply(context, args)
    }
  }
};

function moveTopicActionHandler (action) {
  if (beingDragged && action.text === beingDragged.textContent) {
    // This is an echo of the drag being done locally so ignore it.
  } else {
    const div = divsByTopic[action.text]
    if (div) {
      div.style.left = action.x + 'px'
      div.style.top = action.y + 'px'
      updateClustering(div)
    } else {
      console.error('Got a move action for an unknown topic: {action.text}')
    }
  }
}

function dropHandler (event) {
  event.preventDefault()

  // TODO Prevent drops outside the workspace

  updateClustering(beingDragged)

  const screenX = (event.x - mouseXOffset)
  const screenY = (event.y - mouseYOffset)
  const pageCoords = screenToPageCoords(screenX, screenY)
  const topic = beingDragged.textContent
  sendTopicPosition(topic, pageCoords.left, pageCoords.top) // TODO we may want to use some kind of id rather than the topic string

  beingDragged = null
}

document.querySelector('#go-to-voting').onclick = function (e) {
  assignAllTopicsACluster()
  const topicsByCluster = getTopicByCluster(clustersByTopic)
  ws.send(JSON.stringify({
    type: 'goToVoting',
    clusters: Object.values(topicsByCluster)
  }))
}

function assignAllTopicsACluster () {
  const allTopics = Object.keys(divsByTopic)
  const topicsInClusters = []
  for (const topic in clustersByTopic) {
    topicsInClusters.push(topic)
  }
  const topicsWithoutCluster = allTopics.filter(x => !topicsInClusters.includes(x))
  for (const topic of topicsWithoutCluster) {
    clustersByTopic[topic] = nextCluster++
  }
}

function getTopicByCluster (clustersByTopic) {
  const topicByCluster = {}
  for (const topic in clustersByTopic) {
    const cluster = clustersByTopic[topic]
    if (!topicByCluster[cluster]) {
      topicByCluster[cluster] = []
    }
    topicByCluster[cluster].push(topic)
  }
  return topicByCluster
}

// Voting view code

const votes = []

function initVoting (action) {
  const topicsByClusterId = {}
  for (const cluster of action.clusters) {
    topicsByClusterId[cluster.id] = []
    for (const topicText of cluster.topics) {
      topicsByClusterId[cluster.id].push(topicText)
    }
  }

  const votingClusters = document.querySelector('#voting-clusters')
  for (const cid in topicsByClusterId) {
    votingClusters.appendChild(createVotingClusterUi(cid, topicsByClusterId[cid]))
  }

  const peopleContainer = document.querySelector('#voting-people')
  for (const person of action.people) {
    const div = document.createElement('div')
    div.appendChild(document.createTextNode(person.name))
    const span = document.createElement('span')
    span.id = 'vote-status-' + person.name
    span.style.margin = '5px'
    span.style.color = 'grey'
    div.appendChild(span)
    peopleContainer.appendChild(div)
  }
  updateVoteStatuses(action.people)

  document.querySelector('#voting-done').onclick = function (e) {
    ws.send(JSON.stringify({
      type: 'goToDiscussion'
    }))
  }
}

function createVotingClusterUi (clusterId, topics) {
  const table = document.createElement('table')
  table.style.cssText = 'border: 2px solid black; margin: 5px; border-collapse: collapse;'
  for (const t of topics) {
    const tr = document.createElement('tr')
    tr.style.cssText = 'border: 1px solid black'
    const textEl = document.createTextNode(t)
    tr.appendChild(textEl)
    table.appendChild(tr)
  }

  const tr = document.createElement('tr')

  let voteCounter = 0
  const voteCountView = document.createElement('span')
  voteCountView.style.margin = '3px'
  function updateVoteCounter () {
    voteCountView.innerText = `${voteCounter}`
  }
  updateVoteCounter()

  const voteDown = document.createElement('input')
  voteDown.type = 'button'
  voteDown.value = '-'
  voteDown.onclick = function (e) {
    e.preventDefault()
    if (voteCounter > 0) {
      voteCounter--
      // Remove 1 vote for this item from the global votes list
      votes.splice(votes.indexOf(clusterId), 1)
      ws.send(JSON.stringify({
        type: 'setVotes',
        votes
      }))
    }
    updateVoteCounter()
  }

  const voteUp = document.createElement('input')
  voteUp.type = 'button'
  voteUp.value = '+'
  voteUp.onclick = function (e) {
    e.preventDefault()
    if (votes.length < 3) {
      voteCounter++
      votes.push(clusterId)
      ws.send(JSON.stringify({
        type: 'setVotes',
        votes
      }))
    }
    updateVoteCounter()
  }

  tr.appendChild(voteDown)
  tr.appendChild(voteCountView)
  tr.appendChild(voteUp)

  table.appendChild(tr)

  return table
}

function updateVoteStatuses (people) {
  for (const person of people) {
    const span = document.querySelector('#vote-status-' + person.name)
    if (person.numVotes === 3) {
      span.innerText = 'All votes in'
    } else {
      span.innerText = ''
    }
  }
}

function updateVotesActionHandler (action) {
  updateVoteStatuses(action.people)
}

// Discussion view

function initDiscussion (initAction) {
  const clustersContainer = document.querySelector('#discussion-clusters')
  clustersContainer.innerHTML = ''
  initAction.clusters.sort((a, b) => b.votes - a.votes)
  for (const c of initAction.clusters) {
    clustersContainer.appendChild(createDiscussionClusterUi(c))
  }

  document.querySelector('#discussion-action-text').onkeydown = function (e) {
    if (e.keyCode === 13) { // enter, return
      document.querySelector('#discussion-add-action').click()
    }
  }
  document.querySelector('#discussion-add-action').onclick = function (e) {
    const input = document.querySelector('#discussion-action-text')
    ws.send(JSON.stringify({
      type: 'addAction',
      text: input.value
    }))
    input.value = ''
  }

  const actionsContainer = document.querySelector('#discussion-actions')
  actionsContainer.innerHTML = '<h3>Action Items</h3>'
  const ul = document.createElement('ul')
  ul.style.cssText = 'padding-inline-start: 15px;'
  for (const a of initAction.actions) {
    const li = document.createElement('li')
    li.innerText = a
    ul.appendChild(li)
  }
  actionsContainer.appendChild(ul)
}

function createDiscussionClusterUi (cluster) {
  const table = document.createElement('table')
  table.style.cssText = 'border: 2px solid black; margin: 5px; border-collapse: collapse; display: inline-block; vertical-align: top;'

  const tr = document.createElement('tr')
  const voteCountView = document.createElement('span')
  voteCountView.style.margin = '3px'
  if (cluster.votes === 1) {
    voteCountView.innerText = '1 vote'
  } else {
    voteCountView.innerText = `${cluster.votes} votes`
  }
  tr.appendChild(voteCountView)
  table.appendChild(tr)

  for (const t of cluster.topics) {
    const tr = document.createElement('tr')
    tr.style.cssText = 'border: 1px solid black'
    const textEl = document.createTextNode(t)
    tr.appendChild(textEl)
    table.appendChild(tr)
  }

  return table
}
