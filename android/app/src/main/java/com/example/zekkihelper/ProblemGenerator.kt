package com.example.zekkihelper

import kotlin.random.Random

object ProblemGenerator {
    data class Problem(val questionText: String, val answer: Int)

    fun generate(): Problem {
        val num1 = Random.nextInt(10, 100)
        val num2 = Random.nextInt(10, 100)
        val isAddition = Random.nextBoolean()

        return if (isAddition) {
            Problem(questionText = "$num1 + $num2", answer = num1 + num2)
        } else {
            val multiNum1 = Random.nextInt(2, 20)
            val multiNum2 = Random.nextInt(2, 10)
            Problem(questionText = "$multiNum1 × $multiNum2", answer = multiNum1 * multiNum2)
        }
    }
}