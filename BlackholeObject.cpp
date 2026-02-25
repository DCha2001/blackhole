#include "BlackholeObject.h"


#include <glad/glad.h>
#include <GLFW/glfw3.h>


#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>

#include <cmath>

Blackhole::Blackhole(float x, float y, float z, float radius)
	: x(x), y(y), z(z), radius(radius) {

	float* vertices = new float[verticesCount * 3];

	vertices[0] = x;
	vertices[1] = y;
	vertices[2] = z;

    for (int i = 1; i < verticesCount; i++) {
        float angle = 2.0f * 3.1415926f * (i-1) / (verticesCount-2); // angle in radians
        vertices[i * 3 + 0] = x + radius * cos(angle); // x
        vertices[i * 3 + 1] = y + radius * sin(angle); // y
		vertices[i * 3 + 2] = z;                       // z
    }

    glGenVertexArrays(1, &VAO );
    glGenBuffers(1, &VBO);
    // bind the Vertex Array Object first, then bind and set vertex buffer(s), and then configure vertex attributes(s).
    glBindVertexArray(VAO);

    glBindBuffer(GL_ARRAY_BUFFER, VBO);
    glBufferData(GL_ARRAY_BUFFER, verticesCount * 3 * sizeof(float), vertices, GL_STATIC_DRAW);


    // position attribute
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 3 * sizeof(float), (void*)0);
    glEnableVertexAttribArray(0);

    // note that this is allowed, the call to glVertexAttribPointer registered VBO as the vertex attribute's bound vertex buffer object so afterwards we can safely unbind
    glBindBuffer(GL_ARRAY_BUFFER, 0);
    glBindVertexArray(0);

    delete[] vertices;
}

Blackhole::~Blackhole() {
	// Cleanup if needed
    glDeleteBuffers(1, &VBO);
    glDeleteVertexArrays(1, &VAO);
}

unsigned int Blackhole::getVBO() {
    // Set up Vertex Buffer Object (VBO) if needed
    return VBO;
}

unsigned int Blackhole::getVAO() {
    // Set up Vertex Array Object (VAO) if needed
	return VAO;
}

void Blackhole::draw() {
	// Drawing logic for the black hole

	glBindVertexArray(VAO);
	glDrawArrays(GL_TRIANGLE_FAN, 0, verticesCount);
    

}

void Blackhole::update() {
	// Update logic for the black hole
}