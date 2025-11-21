// Math Genius Kids - Educational Math App
// AI-powered adaptive learning for ages 4-12

class MathGeniusApp {
    constructor() {
        this.student = {
            name: '',
            age: 0,
            level: 1,
            score: 0,
            streak: 0,
            bestStreak: 0,
            correctAnswers: 0,
            totalProblems: 0,
            assessmentResults: [],
            skillLevel: 'beginner' // beginner, intermediate, advanced
        };
        
        this.currentQuestion = null;
        this.assessmentQuestions = [];
        this.assessmentIndex = 0;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Welcome screen
        document.getElementById('start-assessment').addEventListener('click', () => {
            this.startAssessment();
        });
        
        // Assessment screen
        document.getElementById('next-assessment').addEventListener('click', () => {
            this.nextAssessmentQuestion();
        });
        
        // Practice screen
        document.getElementById('submit-answer').addEventListener('click', () => {
            this.checkPracticeAnswer();
        });
        
        document.getElementById('practice-answer').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.checkPracticeAnswer();
            }
        });
        
        document.getElementById('next-question').addEventListener('click', () => {
            this.generatePracticeQuestion();
        });
        
        // Results screen
        document.getElementById('continue-practice').addEventListener('click', () => {
            this.continuePractice();
        });
        
        document.getElementById('restart-app').addEventListener('click', () => {
            this.restartApp();
        });
    }
    
    startAssessment() {
        const age = parseInt(document.getElementById('age').value);
        const name = document.getElementById('student-name').value.trim();
        const ageSelect = document.getElementById('age');
        const nameInput = document.getElementById('student-name');
        
        if (!age) {
            ageSelect.style.borderColor = '#f44336';
            ageSelect.focus();
            return;
        }
        
        if (!name) {
            nameInput.style.borderColor = '#f44336';
            nameInput.focus();
            return;
        }
        
        // Reset border colors
        ageSelect.style.borderColor = '';
        nameInput.style.borderColor = '';
        
        this.student.age = age;
        this.student.name = name;
        
        // Generate assessment questions based on age
        this.assessmentQuestions = this.generateAssessmentQuestions();
        this.assessmentIndex = 0;
        
        this.showScreen('assessment-screen');
        this.displayAssessmentQuestion();
    }
    
    generateAssessmentQuestions() {
        const questions = [];
        const age = this.student.age;
        
        // Generate 5 progressive questions to assess skill level
        // Start easy and increase difficulty
        
        if (age <= 6) {
            // Ages 4-6: Basic counting and simple addition
            questions.push(this.generateQuestion('counting', 1, 10));
            questions.push(this.generateQuestion('addition', 1, 5));
            questions.push(this.generateQuestion('subtraction', 1, 5));
            questions.push(this.generateQuestion('addition', 5, 10));
            questions.push(this.generateQuestion('subtraction', 5, 10));
        } else if (age <= 8) {
            // Ages 7-8: Addition, subtraction, intro to multiplication
            questions.push(this.generateQuestion('addition', 10, 20));
            questions.push(this.generateQuestion('subtraction', 10, 20));
            questions.push(this.generateQuestion('multiplication', 1, 5));
            questions.push(this.generateQuestion('addition', 20, 50));
            questions.push(this.generateQuestion('multiplication', 5, 10));
        } else {
            // Ages 9-12: All operations with larger numbers
            questions.push(this.generateQuestion('addition', 50, 100));
            questions.push(this.generateQuestion('subtraction', 50, 100));
            questions.push(this.generateQuestion('multiplication', 10, 12));
            questions.push(this.generateQuestion('division', 10, 100));
            questions.push(this.generateQuestion('mixed', 10, 50));
        }
        
        return questions;
    }
    
    generateQuestion(type, min, max) {
        let question, answer, options;
        
        switch (type) {
            case 'counting':
                const countNum = this.randomInt(min, max);
                question = `How many stars? ${'⭐'.repeat(countNum)}`;
                answer = countNum;
                options = this.generateOptions(answer, min, max);
                break;
                
            case 'addition':
                const a1 = this.randomInt(min, max);
                const a2 = this.randomInt(min, max);
                question = `${a1} + ${a2} = ?`;
                answer = a1 + a2;
                options = this.generateOptions(answer, answer - 10, answer + 10);
                break;
                
            case 'subtraction':
                const s1 = this.randomInt(min, max);
                const s2 = this.randomInt(min, s1);
                question = `${s1} - ${s2} = ?`;
                answer = s1 - s2;
                options = this.generateOptions(answer, 0, max);
                break;
                
            case 'multiplication':
                const m1 = this.randomInt(min, max);
                const m2 = this.randomInt(min, max);
                question = `${m1} × ${m2} = ?`;
                answer = m1 * m2;
                options = this.generateOptions(answer, answer - 20, answer + 20);
                break;
                
            case 'division':
                const divisor = this.randomInt(2, 12);
                const quotient = this.randomInt(2, max / divisor);
                const dividend = divisor * quotient;
                question = `${dividend} ÷ ${divisor} = ?`;
                answer = quotient;
                options = this.generateOptions(answer, 1, max / 2);
                break;
                
            case 'mixed':
                // Random operation
                const operations = ['addition', 'subtraction', 'multiplication'];
                const randomOp = operations[Math.floor(Math.random() * operations.length)];
                return this.generateQuestion(randomOp, min, max);
                
            default:
                question = '1 + 1 = ?';
                answer = 2;
                options = [1, 2, 3, 4];
        }
        
        return { question, answer, options, type };
    }
    
    generateOptions(correctAnswer, min, max) {
        const options = [correctAnswer];
        
        while (options.length < 4) {
            const option = this.randomInt(Math.max(0, min), max);
            if (!options.includes(option)) {
                options.push(option);
            }
        }
        
        // Shuffle options
        return options.sort(() => Math.random() - 0.5);
    }
    
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    displayAssessmentQuestion() {
        const question = this.assessmentQuestions[this.assessmentIndex];
        this.currentQuestion = question;
        
        // Update progress bar
        const progress = ((this.assessmentIndex + 1) / this.assessmentQuestions.length) * 100;
        document.getElementById('assessment-progress').style.width = `${progress}%`;
        
        // Update question number
        document.getElementById('question-num').textContent = this.assessmentIndex + 1;
        
        // Display question
        document.getElementById('assessment-question').textContent = question.question;
        
        // Display options
        const answersContainer = document.getElementById('assessment-answers');
        answersContainer.innerHTML = '';
        
        question.options.forEach(option => {
            const button = document.createElement('button');
            button.className = 'answer-option';
            button.textContent = option;
            button.addEventListener('click', () => {
                this.selectAssessmentAnswer(option, button);
            });
            answersContainer.appendChild(button);
        });
        
        // Clear feedback
        document.getElementById('assessment-feedback').textContent = '';
        document.getElementById('assessment-feedback').className = 'feedback';
        document.getElementById('next-assessment').style.display = 'none';
    }
    
    selectAssessmentAnswer(selectedAnswer, button) {
        const question = this.currentQuestion;
        const isCorrect = selectedAnswer === question.answer;
        
        // Record result
        this.student.assessmentResults.push({
            question: question.question,
            correct: isCorrect,
            type: question.type
        });
        
        // Disable all buttons
        const buttons = document.querySelectorAll('.answer-option');
        buttons.forEach(btn => {
            btn.style.pointerEvents = 'none';
            if (parseInt(btn.textContent) === question.answer) {
                btn.classList.add('correct');
            } else if (btn === button && !isCorrect) {
                btn.classList.add('incorrect');
            }
        });
        
        // Show feedback
        const feedback = document.getElementById('assessment-feedback');
        if (isCorrect) {
            feedback.textContent = this.getPositiveFeedback();
            feedback.classList.add('correct');
        } else {
            feedback.textContent = `The correct answer is ${question.answer}. Keep trying!`;
            feedback.classList.add('incorrect');
        }
        
        // Show next button
        document.getElementById('next-assessment').style.display = 'inline-block';
    }
    
    nextAssessmentQuestion() {
        this.assessmentIndex++;
        
        if (this.assessmentIndex < this.assessmentQuestions.length) {
            this.displayAssessmentQuestion();
        } else {
            this.completeAssessment();
        }
    }
    
    completeAssessment() {
        // Analyze assessment results using AI logic
        const correctCount = this.student.assessmentResults.filter(r => r.correct).length;
        const accuracy = (correctCount / this.student.assessmentResults.length) * 100;
        
        // Determine skill level based on performance
        if (accuracy >= 80) {
            this.student.skillLevel = 'advanced';
            this.student.level = 3;
        } else if (accuracy >= 50) {
            this.student.skillLevel = 'intermediate';
            this.student.level = 2;
        } else {
            this.student.skillLevel = 'beginner';
            this.student.level = 1;
        }
        
        // Start practice mode
        this.startPractice();
    }
    
    startPractice() {
        document.getElementById('display-name').textContent = this.student.name;
        document.getElementById('current-level').textContent = this.student.level;
        document.getElementById('streak-count').textContent = this.student.streak;
        document.getElementById('score-count').textContent = this.student.score;
        
        this.showScreen('practice-screen');
        this.generatePracticeQuestion();
    }
    
    generatePracticeQuestion() {
        // Clear previous state
        document.getElementById('practice-answer').value = '';
        document.getElementById('practice-feedback').textContent = '';
        document.getElementById('practice-feedback').className = 'feedback';
        document.getElementById('next-question').style.display = 'none';
        document.getElementById('submit-answer').disabled = false;
        document.getElementById('practice-answer').disabled = false;
        
        // Generate question based on current level and skill
        const level = this.student.level;
        let min, max, types;
        
        if (this.student.age <= 6) {
            min = level * 5;
            max = level * 10;
            types = ['addition', 'subtraction'];
        } else if (this.student.age <= 8) {
            min = level * 10;
            max = level * 20;
            types = ['addition', 'subtraction', 'multiplication'];
        } else {
            min = level * 20;
            max = level * 50;
            types = ['addition', 'subtraction', 'multiplication', 'division'];
        }
        
        const type = types[Math.floor(Math.random() * types.length)];
        this.currentQuestion = this.generateQuestion(type, min, max);
        
        document.getElementById('practice-question').textContent = this.currentQuestion.question;
        document.getElementById('practice-answer').focus();
    }
    
    checkPracticeAnswer() {
        const answerInput = document.getElementById('practice-answer');
        const userAnswer = parseInt(answerInput.value);
        
        if (isNaN(userAnswer)) {
            answerInput.style.borderColor = '#f44336';
            answerInput.focus();
            return;
        }
        
        answerInput.style.borderColor = '';
        
        const isCorrect = userAnswer === this.currentQuestion.answer;
        const feedback = document.getElementById('practice-feedback');
        
        this.student.totalProblems++;
        
        if (isCorrect) {
            this.student.correctAnswers++;
            this.student.streak++;
            this.student.score += 10 * this.student.level;
            
            if (this.student.streak > this.student.bestStreak) {
                this.student.bestStreak = this.student.streak;
            }
            
            feedback.textContent = this.getPositiveFeedback();
            feedback.classList.add('correct');
            
            document.getElementById('encouragement').textContent = this.getEncouragement();
            
            // Level up logic
            if (this.student.streak % 5 === 0 && this.student.level < 10) {
                this.student.level++;
                document.getElementById('current-level').textContent = this.student.level;
                feedback.textContent += ` 🎉 Level Up! You're now at Level ${this.student.level}!`;
            }
        } else {
            this.student.streak = 0;
            feedback.textContent = `Not quite! The correct answer is ${this.currentQuestion.answer}. You can do it!`;
            feedback.classList.add('incorrect');
            document.getElementById('encouragement').textContent = "Don't give up! Every mistake helps you learn!";
        }
        
        // Update stats
        document.getElementById('streak-count').textContent = this.student.streak;
        document.getElementById('score-count').textContent = this.student.score;
        
        // Disable input and show next button
        document.getElementById('submit-answer').disabled = true;
        document.getElementById('practice-answer').disabled = true;
        document.getElementById('next-question').style.display = 'inline-block';
        
        // Show results after 10 problems
        if (this.student.totalProblems % 10 === 0) {
            setTimeout(() => {
                this.showResults();
            }, 1500);
        }
    }
    
    getPositiveFeedback() {
        const messages = [
            '🌟 Awesome!',
            '🎉 Perfect!',
            '👏 Great job!',
            '💪 You rock!',
            '⭐ Excellent!',
            '🔥 On fire!',
            '🎯 Bullseye!',
            '🏆 Champion!',
            '✨ Amazing!',
            '🚀 Superstar!'
        ];
        return messages[Math.floor(Math.random() * messages.length)];
    }
    
    getEncouragement() {
        const messages = [
            'Keep up the great work!',
            'You\'re getting better and better!',
            'Your brain is getting stronger!',
            'Math genius in the making!',
            'You\'re unstoppable!',
            'What a smart cookie!',
            'You\'re on a roll!',
            'Fantastic effort!',
            'You\'re learning so fast!',
            'Keep that streak going!'
        ];
        return messages[Math.floor(Math.random() * messages.length)];
    }
    
    showResults() {
        const accuracy = Math.round((this.student.correctAnswers / this.student.totalProblems) * 100);
        
        document.getElementById('total-problems').textContent = this.student.totalProblems;
        document.getElementById('correct-answers').textContent = this.student.correctAnswers;
        document.getElementById('accuracy').textContent = accuracy + '%';
        document.getElementById('best-streak').textContent = this.student.bestStreak;
        document.getElementById('final-level').textContent = this.student.level;
        
        // AI-powered recommendation
        let recommendation = '';
        if (accuracy >= 90) {
            recommendation = 'Outstanding performance! You\'re ready for more challenging problems!';
        } else if (accuracy >= 75) {
            recommendation = 'Great work! Keep practicing to master these skills!';
        } else if (accuracy >= 60) {
            recommendation = 'Good effort! A bit more practice will help you improve!';
        } else {
            recommendation = 'Keep going! Practice makes perfect. You\'re learning and that\'s what matters!';
        }
        
        document.getElementById('recommendation').textContent = recommendation;
        
        this.showScreen('results-screen');
    }
    
    continuePractice() {
        this.showScreen('practice-screen');
        this.generatePracticeQuestion();
    }
    
    restartApp() {
        // Reset student data
        this.student = {
            name: '',
            age: 0,
            level: 1,
            score: 0,
            streak: 0,
            bestStreak: 0,
            correctAnswers: 0,
            totalProblems: 0,
            assessmentResults: [],
            skillLevel: 'beginner'
        };
        
        this.assessmentQuestions = [];
        this.assessmentIndex = 0;
        
        // Clear inputs
        document.getElementById('age').value = '';
        document.getElementById('student-name').value = '';
        
        this.showScreen('welcome-screen');
    }
    
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MathGeniusApp();
});
