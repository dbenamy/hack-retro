function init (action) {
  if (action.type !== 'init') {
    throw new Error('init() called with non-init action.')
  }

  for (const div of document.querySelectorAll('.view')) {
    div.hidden = true
  }
  const view = action.state
  const el = document.querySelector('#' + view + '-view')
  if (el) {
    el.hidden = false
    document.querySelector('#loading').hidden = true
  }
  if (action.state === 'joining') {
    document.querySelector('#name').focus()
    for (const person of action.people) {
      document.querySelector('#participants').value += (person + '\n')
    }
  } else if (action.state === 'brainstorming') {
    for (const topic of action.topics) {
      const listEl = document.querySelector(`#${topic.feeling}-list`)
      listEl.value += (topic.text + '\n')
    }
    document.querySelector('#happy-item').focus()
  } else if (action.state === 'grouping') {
    initGrouping(action)
  } else if (action.state === 'voting') {
    initVoting(action)
  }
}

// const retroId = JSON.parse(document.getElementById('room-name').textContent);
const retroId = 'abdce'

const chatSocket = new WebSocket(
  'ws://' + window.location.host + '/ws/chat/' + retroId + '/'
)

chatSocket.onmessage = function (e) {
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
  }
}

chatSocket.onclose = function (e) {
  console.error('Chat socket closed unexpectedly')
}

// Handlers for the joining view

document.querySelector('#name').onkeydown = function (e) {
  if (e.keyCode === 13) { // enter, return
    document.querySelector('#join').click()
  }
}

document.querySelector('#join').onclick = function (e) {
  const messageInputDom = document.querySelector('#name')
  const name = messageInputDom.value
  chatSocket.send(JSON.stringify({
    type: 'join',
    name
  }))
  messageInputDom.value = ''
}

document.querySelector('#start').onclick = function (e) {
  chatSocket.send(JSON.stringify({
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
  chatSocket.send(JSON.stringify({
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
  chatSocket.send(JSON.stringify({
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
  chatSocket.send(JSON.stringify({
    type: 'addTopic',
    list: 'confused',
    text
  }))
  inputEl.value = ''
}

document.querySelector('#go-to-grouping').onclick = function (e) {
  chatSocket.send(JSON.stringify({
    type: 'goToGrouping'
  }))
}

// Grouping view code

const workspace = document.querySelector('#grouping-workspace')
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

// TODO give credit to SO answer where I got this.
function getCoords (elem) { // crossbrowser version
  const box = elem.getBoundingClientRect()

  const body = document.body
  const docEl = document.documentElement

  const scrollTop = window.pageYOffset || docEl.scrollTop || body.scrollTop
  const scrollLeft = window.pageXOffset || docEl.scrollLeft || body.scrollLeft

  const clientTop = docEl.clientTop || body.clientTop || 0
  const clientLeft = docEl.clientLeft || body.clientLeft || 0

  const top = box.top + scrollTop - clientTop
  const left = box.left + scrollLeft - clientLeft

  return { top: Math.round(top), left: Math.round(left) }
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
  beingDragged.style.left = screenX + 'px'
  const screenY = (event.y - mouseYOffset)
  beingDragged.style.top = screenY + 'px'

  updateClustering(beingDragged)

  const topic = beingDragged.textContent
  const x = screenX - workspaceCoords.left
  const y = screenY - workspaceCoords.top
  debouncedSendTopicPosition(topic, x, y) // TODO we may want to use some kind of id rather than the topic string
}

function sendTopicPosition (topic, x, y) {
  chatSocket.send(JSON.stringify({
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

  const x = (event.x - mouseXOffset)
  const y = (event.y - mouseYOffset)
  const topic = beingDragged.textContent
  sendTopicPosition(topic, x, y) // TODO we may want to use some kind of id rather than the topic string

  beingDragged = null
}

document.querySelector('#go-to-voting').onclick = function (e) {
  assignAllTopicsACluster()
  const topicsByCluster = getTopicByCluster(clustersByTopic)
  for (const cluster in topicsByCluster) {
    console.log(`cluster ${cluster}: ${topicsByCluster[cluster]}`)
  }

  chatSocket.send(JSON.stringify({
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
  for (let cluster of action.clusters) {
    topicsByClusterId[cluster.id] = []
    for (let topicText of cluster.topics) {
      topicsByClusterId[cluster.id].push(topicText)
    }
  }

  const votingClusters = document.querySelector('#voting-clusters')
  for (let cid in topicsByClusterId) {
    votingClusters.appendChild(createVotingClusterUi(cid, topicsByClusterId[cid]))
  }

  document.querySelector('#voting-done').onclick = function (e) {
    chatSocket.send(JSON.stringify({
      type: 'goToDiscussion',
      votes: votes
    }))
  }
}

function createVotingClusterUi(clusterId, topics) {
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
  voteCountView.style.margin = "3px"
  function updateVoteCounter() {
    voteCountView.innerText = `${voteCounter}`
  }
  updateVoteCounter()

  const voteDown = document.createElement('input')
  voteDown.type = "button"
  voteDown.value = "-"
  voteDown.onclick = function (e) {
    e.preventDefault()
    if (voteCounter > 0) {
      voteCounter--
      // Remove 1 vote for this item from the global votes list
      votes.splice(votes.indexOf(clusterId), 1)
    }
    updateVoteCounter()
  }

  const voteUp = document.createElement('input')
  voteUp.type = "button"
  voteUp.value = "+"
  voteUp.onclick = function (e) {
    e.preventDefault()
    if (votes.length < 3) {
      console.log("Increasing vote for cluster " + clusterId)
      voteCounter++
      votes.push(clusterId)
    }
    updateVoteCounter()
  }

  tr.appendChild(voteDown)
  tr.appendChild(voteCountView)
  tr.appendChild(voteUp)

  table.appendChild(tr)

  return table
}
