class Capitalize {
  static firstLetters(text) {
    return text.toLowerCase()
      .split(' ')
      .map((s) => s.charAt(0).toUpperCase() + s.substring(1))
      .join(' ')
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.substring(1))
      .join('-');
  }
}

export default Capitalize