export function parseQuestions(text) {
  const questions = [];
  let current = null;
  let currentOption = null;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const questionMatch = line.match(/^(?:soal\s*)?(\d{1,3})[\s.)-]+(.+)$/i);
    const optionMatch = line.match(/^([A-E])[\s.)-]+(.+)$/i);
    if (questionMatch) {
      if (current?.prompt && current.choices.length >= 2) questions.push(current);
      current = { prompt: questionMatch[2].trim(), choices: [] };
      currentOption = null;
    } else if (optionMatch && current) {
      current.choices.push(optionMatch[2].trim());
      currentOption = current.choices.length - 1;
    } else if (currentOption !== null && current) {
      current.choices[currentOption] = `${current.choices[currentOption]} ${line}`.trim();
    } else if (current) {
      current.prompt = `${current.prompt} ${line}`.trim();
    }
  }
  if (current?.prompt && current.choices.length >= 2) questions.push(current);
  return questions.filter((question) => question.prompt.length <= 2000 &&
    question.choices.length <= 5 && question.choices.every((choice) => choice.length <= 300));
}
