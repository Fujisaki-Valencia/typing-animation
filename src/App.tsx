import DisplayView from './DisplayView'
import InputView from './InputView'

const isInputWindow = new URLSearchParams(window.location.search).get('window') === 'input'

function App() {
  return isInputWindow ? <InputView /> : <DisplayView />
}

export default App
